// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient, type TitleAccess } from '@onyx/database';
import { opensTitle } from '../billing/entitlement.js';
import { SubscriptionsService } from '../billing/subscriptions.service.js';
import type { Watcher } from '../catalog/public-catalog.service.js';
import { AppConfig } from '../config/app-config.js';
import { type LivePlaybackInfo, LivePlaybackService } from './live-playback.service.js';

/** A channel as viewers see it. Nothing about where its video comes from. */
export interface PublicChannel {
  slug: string;
  name: string;
  number: number | null;
  description: string | null;
  access: TitleAccess;
  /** The packages the channel is in, for the site to say whether a plan opens it. */
  packageIds: string[];
  /** Whether the channel is sending right now. */
  onAir: boolean;
}

const PUBLIC_SELECT = {
  id: true,
  slug: true,
  name: true,
  number: true,
  description: true,
  access: true,
  enabled: true,
  status: true,
  packages: { select: { packageId: true } },
} as const;

interface PublicRecord {
  id: string;
  slug: string;
  name: string;
  number: number | null;
  description: string | null;
  access: TitleAccess;
  enabled: boolean;
  status: string;
  packages: { packageId: string }[];
}

/** Live channels for the viewer website and the apps. Only published ones exist here. */
@Injectable()
export class PublicChannelsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
    @Inject(LivePlaybackService) private readonly playback: LivePlaybackService,
  ) {}

  async list(): Promise<PublicChannel[]> {
    const channels = await this.prisma.channel.findMany({
      where: { published: true },
      orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: PUBLIC_SELECT,
    });
    return channels.map(toPublic);
  }

  async get(slug: string): Promise<PublicChannel> {
    return toPublic(await this.find(slug));
  }

  /**
   * A signed address for watching a channel.
   *
   * The rules are those of titles: a free channel is as open as the
   * installation, a paid one needs a signed-in viewer whose plan opens it.
   *
   * @throws ConflictException with code "off_air" when the channel is not sending.
   */
  async play(slug: string, watcher: Watcher): Promise<LivePlaybackInfo> {
    const channel = await this.find(slug);
    await this.assertMayWatch(watcher, channel);
    if (!isOnAir(channel)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: 'This channel is not on air right now',
        // Lets a player wait for the channel instead of showing an error.
        code: 'off_air',
      });
    }
    return this.playback.createPlayback(channel.id);
  }

  private async find(slug: string): Promise<PublicRecord> {
    const channel = await this.prisma.channel.findFirst({
      where: { slug, published: true },
      select: PUBLIC_SELECT,
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }

  private async assertMayWatch(watcher: Watcher, channel: PublicRecord): Promise<void> {
    if (this.config.catalogPlayback === 'off') {
      throw new ForbiddenException('Playback is not open on this installation');
    }
    const paid = channel.access === 'PAID';
    if (!paid && this.config.catalogPlayback !== 'viewers') {
      return;
    }
    if (!watcher) {
      throw new UnauthorizedException('Sign in to watch');
    }
    if (this.config.viewerVerificationRequired && !watcher.emailVerified) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Confirm your email address to watch',
        code: 'email_unverified',
      });
    }
    if (!paid) {
      return;
    }

    const access = await this.subscriptions.accessOf(watcher.viewerId);
    const packageIds = channel.packages.map((link) => link.packageId);
    if (opensTitle(access, packageIds)) {
      return;
    }
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        ...(access
          ? { message: 'Your plan does not include this channel', code: 'plan_required' }
          : { message: 'Subscribe to watch', code: 'subscription_required' }),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

function isOnAir(channel: { enabled: boolean; status: string }): boolean {
  return channel.enabled && channel.status === 'RUNNING';
}

function toPublic(channel: PublicRecord): PublicChannel {
  return {
    slug: channel.slug,
    name: channel.name,
    number: channel.number,
    description: channel.description,
    access: channel.access,
    packageIds: channel.packages.map((link) => link.packageId).sort(),
    onAir: isOnAir(channel),
  };
}
