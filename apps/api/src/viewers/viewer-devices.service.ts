// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type PlayDevice, PrismaClient, type ViewerDevice } from '@onyx/database';
import { MAX_DEVICES } from './device.rules.js';
import type { DeviceInfo } from './device.schemas.js';
import { ACTIVE_SESSION } from './viewer-session.service.js';

/** An app a viewer is, or was, signed in on. */
export interface DeviceView {
  id: string;
  name: string;
  kind: PlayDevice;
  /** The app: "android-tv". */
  platform: string;
  model: string | null;
  appVersion: string | null;
  lastSeenAt: Date;
  createdAt: Date;
  /** Whether it is signed in right now. */
  signedIn: boolean;
  /** Whether the request came from this device. */
  current: boolean;
}

/** The little of a device that is shown beside a sign-in. */
export interface DeviceRef {
  id: string;
  name: string;
  kind: PlayDevice;
  platform: string;
}

export const toDeviceRef = (device: ViewerDevice): DeviceRef => ({
  id: device.id,
  name: device.name,
  kind: device.kind,
  platform: device.platform,
});

/** A device as admins see it: "this device" means nothing to someone who is not the viewer. */
export function withoutCurrent(device: DeviceView): Omit<DeviceView, 'current'> {
  const copy: Partial<DeviceView> = { ...device };
  delete copy.current;
  return copy as Omit<DeviceView, 'current'>;
}

/** The apps a viewer signed in on: televisions, phones, tablets. */
@Injectable()
export class ViewerDevicesService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /**
   * Finds the device of an installation, or remembers it. An app that is
   * signed out and in again is the same device, with the name the viewer
   * gave it.
   */
  async remember(viewerId: string, info: DeviceInfo): Promise<ViewerDevice> {
    const where = { viewerId_installationId: { viewerId, installationId: info.installationId } };
    const facts = {
      kind: info.kind,
      platform: info.platform,
      model: info.model ?? null,
      appVersion: info.appVersion ?? null,
      lastSeenAt: new Date(),
    };
    const device = await this.prisma.viewerDevice.upsert({
      where,
      // The name is kept: the viewer may have changed it.
      update: facts,
      create: { viewerId, installationId: info.installationId, name: info.name, ...facts },
    });
    await this.forgetOldest(viewerId);
    return device;
  }

  /** Keeps the list of an account from growing without end. Devices that are signed in stay. */
  private async forgetOldest(viewerId: string): Promise<void> {
    const count = await this.prisma.viewerDevice.count({ where: { viewerId } });
    if (count <= MAX_DEVICES) {
      return;
    }
    const idle = await this.prisma.viewerDevice.findMany({
      where: { viewerId, sessions: { none: ACTIVE_SESSION() } },
      orderBy: { lastSeenAt: 'asc' },
      take: count - MAX_DEVICES,
      select: { id: true },
    });
    await this.prisma.viewerDevice.deleteMany({
      where: { id: { in: idle.map((device) => device.id) } },
    });
  }

  async list(viewerId: string, currentDeviceId: string | null = null): Promise<DeviceView[]> {
    const devices = await this.prisma.viewerDevice.findMany({
      where: { viewerId },
      orderBy: { lastSeenAt: 'desc' },
      include: { _count: { select: { sessions: { where: ACTIVE_SESSION() } } } },
    });
    return devices.map(({ _count, ...device }) => ({
      id: device.id,
      name: device.name,
      kind: device.kind,
      platform: device.platform,
      model: device.model,
      appVersion: device.appVersion,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
      signedIn: _count.sessions > 0,
      current: device.id === currentDeviceId,
    }));
  }

  /** @throws NotFoundException when the device is not the viewer's. */
  async rename(viewerId: string, deviceId: string, name: string): Promise<ViewerDevice> {
    const { count } = await this.prisma.viewerDevice.updateMany({
      where: { id: deviceId, viewerId },
      data: { name },
    });
    if (count === 0) {
      throw new NotFoundException('Device not found');
    }
    return this.prisma.viewerDevice.findUniqueOrThrow({ where: { id: deviceId } });
  }

  /**
   * Signs a device out and forgets it.
   *
   * @returns The device, for the record of who removed what.
   * @throws NotFoundException when the device is not the viewer's.
   */
  async remove(viewerId: string, deviceId: string): Promise<ViewerDevice> {
    const device = await this.prisma.viewerDevice.findFirst({ where: { id: deviceId, viewerId } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    await this.prisma.$transaction([
      this.prisma.viewerSession.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.viewerDevice.delete({ where: { id: deviceId } }),
    ]);
    return device;
  }

  /** Notes that a device was just used, and with which version of the app. */
  async seen(deviceId: string, appVersion: string | null): Promise<void> {
    await this.prisma.viewerDevice.updateMany({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(), ...(appVersion ? { appVersion } : {}) },
    });
  }
}
