// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { type EncodingProfile, type EncodingProfileRendition, PrismaClient } from '@onyx/database';
import { isUniqueViolation } from '../common/prisma-errors.js';
import {
  type CreateEncodingProfileInput,
  KEYFRAME_MESSAGE,
  type UpdateEncodingProfileInput,
} from './encoding-profiles.schemas.js';

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
    // A fresh installation shows its default profile right away.
    await this.ensureDefault();
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

  async create(input: CreateEncodingProfileInput): Promise<EncodingProfileWithRenditions> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.encodingProfile.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.encodingProfile.create({
          data: {
            name: input.name,
            description: input.description,
            isDefault: input.isDefault,
            segmentSeconds: input.segmentSeconds,
            keyframeSeconds: input.keyframeSeconds,
            renditions: {
              create: input.renditions.map((rendition, index) => ({
                ...rendition,
                sortOrder: index,
              })),
            },
          },
          include: withRenditions,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An encoding profile with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Changes a profile. Assets that are already processed keep their files.
   * The change applies to assets processed or reprocessed afterwards.
   */
  async update(
    id: string,
    input: UpdateEncodingProfileInput,
  ): Promise<EncodingProfileWithRenditions> {
    const profile = await this.get(id);

    const segmentSeconds = input.segmentSeconds ?? profile.segmentSeconds;
    const keyframeSeconds = input.keyframeSeconds ?? profile.keyframeSeconds;
    if (segmentSeconds % keyframeSeconds !== 0) {
      throw new BadRequestException(KEYFRAME_MESSAGE);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (input.isDefault && !profile.isDefault) {
          await tx.encodingProfile.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
          });
        }
        if (input.renditions) {
          await tx.encodingProfileRendition.deleteMany({ where: { profileId: id } });
        }
        return tx.encodingProfile.update({
          where: { id },
          data: {
            name: input.name,
            description: input.description,
            isDefault: input.isDefault,
            segmentSeconds: input.segmentSeconds,
            keyframeSeconds: input.keyframeSeconds,
            renditions: input.renditions
              ? {
                  create: input.renditions.map((rendition, index) => ({
                    ...rendition,
                    sortOrder: index,
                  })),
                }
              : undefined,
          },
          include: withRenditions,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An encoding profile with this name already exists');
      }
      throw error;
    }
  }

  /** Deletes a profile that is neither the default nor used by an asset that could be reprocessed. */
  async delete(id: string): Promise<EncodingProfileWithRenditions> {
    const profile = await this.get(id);
    if (profile.isDefault) {
      throw new ConflictException(
        'The default encoding profile cannot be deleted. Make another profile the default first',
      );
    }

    const inUse = await this.prisma.asset.count({
      where: { encodingProfileId: id, status: { not: 'DELETED' } },
    });
    if (inUse > 0) {
      throw new ConflictException(
        `This profile is used by ${inUse} asset(s) and cannot be deleted`,
      );
    }

    await this.prisma.encodingProfile.delete({ where: { id } });
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
