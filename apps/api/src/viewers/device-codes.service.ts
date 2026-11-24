// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type DeviceCode, type PlayDevice, PrismaClient } from '@onyx/database';
import type { RequestInfo } from '../auth/request-info.js';
import { hashToken } from '../auth/tokens.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { AppConfig } from '../config/app-config.js';
import {
  DEVICE_CODE_TTL_MS,
  formatUserCode,
  generateUserCode,
  KEEP_DEVICE_CODES_MS,
  MIN_POLL_GAP_MS,
  normalizeUserCode,
  POLL_INTERVAL_SECONDS,
  verificationUrls,
} from './device.rules.js';
import type { DeviceInfo } from './device.schemas.js';
import { ViewerDevicesService } from './viewer-devices.service.js';
import {
  type ProfileView,
  toProfileView,
  ViewerProfilesService,
} from './viewer-profiles.service.js';
import { ViewerSessionService } from './viewer-session.service.js';
import { toViewerView, type ViewerView } from './viewer.view.js';

/** What a device gets when it asks to be signed in with a code. */
export interface StartedDeviceCode {
  /** The secret the device asks with from now on. It is never shown to the viewer. */
  deviceCode: string;
  /** What the device shows: "CDFG-HJKM". */
  userCode: string;
  /** Where the viewer enters the code. Shown beside it. */
  verificationUrl: string;
  /** The same with the code filled in, for a QR code. */
  verificationUrlComplete: string;
  /** Seconds until the code stops working. */
  expiresIn: number;
  /** Seconds to wait between asking whether the viewer has answered. */
  interval: number;
}

/**
 * Where a device stands. "pending": keep asking. "approved": signed in, the
 * token is in the answer, once. The other two end the attempt: show a new code.
 */
export type DeviceCodePoll =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'expired' }
  | {
      status: 'approved';
      token: string;
      expiresAt: Date;
      viewer: ViewerView;
      profile: ProfileView;
      device: { id: string; name: string };
      /** Whether a profile has to be chosen first: the main one has a PIN. */
      chooseProfile: boolean;
    };

/** The device that asks, as the viewer sees it before they answer. */
export interface DeviceCodeRequest {
  userCode: string;
  device: { name: string; kind: PlayDevice; platform: string; model: string | null };
  requestedAt: Date;
  expiresAt: Date;
}

const NOT_FOUND = 'This code is not valid. Check the code on your device, or get a new one there.';

/**
 * Signing a device in without a keyboard.
 *
 * The device asks for a code and shows it. The viewer, signed in on a phone
 * or a computer, enters the code and says yes. The device, which has been
 * asking every few seconds, gets its sign-in.
 *
 * Two secrets keep this safe. The short code proves nothing by itself: it
 * only lets a signed-in viewer say "this device is mine". The sign-in goes
 * to whoever holds the long secret, which never leaves the device.
 */
@Injectable()
export class DeviceCodesService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(ViewerSessionService) private readonly sessions: ViewerSessionService,
    @Inject(ViewerDevicesService) private readonly devices: ViewerDevicesService,
    @Inject(ViewerProfilesService) private readonly profiles: ViewerProfilesService,
  ) {}

  async start(device: DeviceInfo, info: RequestInfo): Promise<StartedDeviceCode> {
    await this.prune();
    const deviceCode = randomBytes(32).toString('base64url');
    // Two codes at once being the same is a matter of luck: try again.
    for (let attempt = 0; ; attempt += 1) {
      const userCode = generateUserCode();
      try {
        await this.prisma.deviceCode.create({
          data: {
            deviceCodeHash: hashToken(deviceCode),
            userCode,
            installationId: device.installationId,
            name: device.name,
            kind: device.kind,
            platform: device.platform,
            model: device.model ?? null,
            appVersion: device.appVersion ?? null,
            ipAddress: info.ipAddress,
            userAgent: info.userAgent,
            expiresAt: new Date(Date.now() + DEVICE_CODE_TTL_MS),
          },
        });
        const urls = verificationUrls(this.config.siteUrl, userCode);
        return {
          deviceCode,
          userCode: formatUserCode(userCode),
          verificationUrl: urls.url,
          verificationUrlComplete: urls.complete,
          expiresIn: DEVICE_CODE_TTL_MS / 1000,
          interval: POLL_INTERVAL_SECONDS,
        };
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= 4) {
          throw error;
        }
      }
    }
  }

  /**
   * The device asks whether it was let in.
   *
   * @throws HttpException 429 with code "slow_down" when it asks too often.
   */
  async poll(deviceCode: string, info: RequestInfo): Promise<DeviceCodePoll> {
    const code = await this.prisma.deviceCode.findUnique({
      where: { deviceCodeHash: hashToken(deviceCode) },
    });
    // An unknown secret and a used one look like a code that ran out: nothing to learn here.
    if (!code || code.status === 'USED' || code.expiresAt.getTime() <= Date.now()) {
      return { status: 'expired' };
    }
    if (code.status === 'DENIED') {
      return { status: 'denied' };
    }
    if (code.status === 'PENDING') {
      if (code.lastPolledAt && Date.now() - code.lastPolledAt.getTime() < MIN_POLL_GAP_MS) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            code: 'slow_down',
            message: `Ask every ${POLL_INTERVAL_SECONDS} seconds.`,
            interval: POLL_INTERVAL_SECONDS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await this.prisma.deviceCode.update({
        where: { id: code.id },
        data: { lastPolledAt: new Date() },
      });
      return { status: 'pending' };
    }

    // Approved. The code is spent first, so two requests at once cannot both sign in.
    const spent = await this.prisma.deviceCode.updateMany({
      where: { id: code.id, status: 'APPROVED' },
      data: { status: 'USED' },
    });
    const viewer = code.viewerId
      ? await this.prisma.viewer.findUnique({ where: { id: code.viewerId } })
      : null;
    if (spent.count === 0 || !viewer || viewer.status !== 'ACTIVE') {
      return { status: 'expired' };
    }
    const device = await this.devices.remember(viewer.id, {
      installationId: code.installationId,
      name: code.name,
      kind: code.kind,
      platform: code.platform,
      model: code.model ?? undefined,
      appVersion: code.appVersion ?? undefined,
    });
    const { token, session } = await this.sessions.create(viewer.id, info, device.id);
    await this.prisma.viewer.update({
      where: { id: viewer.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      status: 'approved',
      token,
      expiresAt: session.expiresAt,
      viewer: toViewerView(viewer),
      profile: toProfileView(await this.profiles.main(viewer)),
      device: { id: device.id, name: device.name },
      chooseProfile: session.profileLocked,
    };
  }

  /** @throws NotFoundException for a code that is unknown, answered or over. */
  async find(input: string): Promise<DeviceCodeRequest> {
    return toRequest(await this.pending(input));
  }

  /** The viewer says: this device is mine, sign it in. */
  async approve(input: string, viewerId: string): Promise<DeviceCodeRequest> {
    return this.answer(input, viewerId, 'APPROVED');
  }

  /** The viewer says: I did not ask for this. */
  async deny(input: string, viewerId: string): Promise<DeviceCodeRequest> {
    return this.answer(input, viewerId, 'DENIED');
  }

  private async answer(
    input: string,
    viewerId: string,
    status: 'APPROVED' | 'DENIED',
  ): Promise<DeviceCodeRequest> {
    const code = await this.pending(input);
    // Only a code nobody answered yet: the first answer stands.
    const { count } = await this.prisma.deviceCode.updateMany({
      where: { id: code.id, status: 'PENDING', expiresAt: { gt: new Date() } },
      data: { status, viewerId },
    });
    if (count === 0) {
      throw new NotFoundException(NOT_FOUND);
    }
    return toRequest(code);
  }

  private async pending(input: string): Promise<DeviceCode> {
    const userCode = normalizeUserCode(input);
    const code = userCode ? await this.prisma.deviceCode.findUnique({ where: { userCode } }) : null;
    if (!code || code.status !== 'PENDING' || code.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException(NOT_FOUND);
    }
    return code;
  }

  /** Clears out codes that have been over for a day. */
  async prune(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.deviceCode.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - KEEP_DEVICE_CODES_MS) } },
    });
    return count;
  }
}

function toRequest(code: DeviceCode): DeviceCodeRequest {
  return {
    userCode: formatUserCode(code.userCode),
    device: { name: code.name, kind: code.kind, platform: code.platform, model: code.model },
    requestedAt: code.createdAt,
    expiresAt: code.expiresAt,
  };
}
