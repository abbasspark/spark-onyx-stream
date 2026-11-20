// SPDX-License-Identifier: AGPL-3.0-only
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { type EncodingProfile, type EncodingProfileRendition, PrismaClient } from '@onyx/database';
import { isUniqueViolation } from '../common/prisma-errors.js';

export type EncodingProfileWithRenditions = EncodingProfile & {
  renditions: EncodingProfileRendition[];
};

export const DEFAULT_PROFILE_NAME = 'default';

/** The ladder of the profile created on a fresh installation. Bitrates in bits per second. */
const DEFAULT_RENDITIONS = [
  { name: '1080p', height: 1080, videoBitrate: 5_000_000, audioBitrate: 128_000, sortOrder: 0 },
  { name: '720p', height: 720, videoBitrate: 2_800_000, audioBitrate: 128_000, sortOrder: 1 },
  { name: '480p', height: 480, videoBitrate: 1_400_000, audioBitrate: 96_000, sortOrder: 2 },
  { name: '360p', height: 360, videoBitrate: 800_000, audioBitrate: 96_000, sortOrder: 3 },
];

const withRenditions = { renditions: { orderBy: { sortOrder: 'asc' } } } as const;

@Injectable()
export class EncodingProfilesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EncodingProfilesService.name);

  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureDefault();
    } catch (error) {
      // The database may still be starting. getDefault tries again on first use.
      this.logger.warn(
        `Could not check the default encoding profile at startup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Creates the default profile when the installation has none. */
  async ensureDefault(): Promise<void> {
    if ((await this.prisma.encodingProfile.count()) > 0) {
      return;
    }

    try {
      await this.prisma.encodingProfile.create({
        data: {
          name: DEFAULT_PROFILE_NAME,
          description: 'H.264 with AAC audio in four qualities from 360p to 1080p',
          isDefault: true,
          renditions: { create: DEFAULT_RENDITIONS },
        },
      });
      this.logger.log('Created the default encoding profile');
    } catch (error) {
      // Another process created it at the same moment.
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }

  async list(): Promise<EncodingProfileWithRenditions[]> {
    return this.prisma.encodingProfile.findMany({
      orderBy: { createdAt: 'asc' },
      include: withRenditions,
    });
  }

  async get(id: string): Promise<EncodingProfileWithRenditions> {
    const profile = await this.prisma.encodingProfile.findUnique({
      where: { id },
      include: withRenditions,
    });
    if (!profile) {
      throw new NotFoundException('Encoding profile not found');
    }
    return profile;
  }

  /** The profile used for assets that do not name one. */
  async getDefault(): Promise<EncodingProfileWithRenditions> {
    await this.ensureDefault();

    const profile =
      (await this.prisma.encodingProfile.findFirst({
        where: { isDefault: true },
        include: withRenditions,
      })) ??
      (await this.prisma.encodingProfile.findFirst({
        orderBy: { createdAt: 'asc' },
        include: withRenditions,
      }));

    if (!profile) {
      throw new Error('No encoding profile is configured');
    }
    return profile;
  }
}
