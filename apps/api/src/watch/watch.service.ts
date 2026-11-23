// SPDX-License-Identifier: AGPL-3.0-only
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient, type WatchedFileState, type WatchLocation } from '@onyx/database';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { SecretBox } from '../crypto/secret-box.js';
import { EventPublisher } from '../events/event-publisher.js';
import {
  encryptS3Config,
  type LocalConfig,
  localConfigSchema,
  mergeS3Config,
  parseStoredConfig,
  type PublicPoolConfig,
  s3ConfigUpdateSchema,
  type S3StoredConfig,
  toPublicConfig,
} from '../storage/storage-pool.config.js';
import { StorageService } from '../storage/storage.service.js';
import { isCandidate, parseWatchedName } from './watch-name.js';
import {
  type CreateLocationInput,
  type ListFilesInput,
  type LocationPlace,
  type MatchFileInput,
  type RetryAllInput,
  type RetryFileInput,
  type UpdateLocationInput,
  WATCHED_FILE_STATES,
} from './watch.schemas.js';

/** How many files a test of a place looks at before it stops counting. */
const TEST_LIMIT = 5000;
const TEST_SAMPLES = 8;

export interface LocationView {
  id: string;
  name: string;
  driver: WatchLocation['driver'];
  config: PublicPoolConfig;
  isActive: boolean;
  scanIntervalMinutes: number;
  storagePool: { id: string; name: string } | null;
  processingMode: WatchLocation['processingMode'];
  encodingProfile: { id: string; name: string } | null;
  autoPublish: boolean;
  afterImport: WatchLocation['afterImport'];
  lastScanAt: Date | null;
  lastScanError: string | null;
  /** True while a look asked for by an admin has not happened yet. */
  scanRequested: boolean;
  /** Files by what became of them. States without files are left out. */
  counts: Partial<Record<WatchedFileState, number>>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchedFileView {
  id: string;
  location: { id: string; name: string };
  path: string;
  /** Bytes, as a string: a file can be larger than a JSON number holds exactly. */
  size: string;
  modifiedAt: Date;
  state: WatchedFileState;
  /** "movie:603" or "tv:1399". Null while nobody knows what the file is. */
  metadataId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  matchedByHand: boolean;
  title: { id: string; type: 'MOVIE' | 'SERIES'; name: string } | null;
  episode: { id: string; name: string } | null;
  asset: { id: string; status: string } | null;
  publishPending: boolean;
  note: string | null;
  firstSeenAt: Date;
  importedAt: Date | null;
}

/** What a place holds right now, shown before a location is saved. */
export interface PlaceTest {
  /** Files looked at. Capped, see {@link PlaceTest.capped}. */
  files: number;
  videos: number;
  recognised: number;
  capped: boolean;
  /**
   * Whether files can be moved or deleted there. A place that can only be read
   * still imports, but leaves its files where they are.
   */
  writable: boolean;
  samples: { path: string; recognisedAs: string | null }[];
}

export interface WatchSummary {
  locations: number;
  counts: Partial<Record<WatchedFileState, number>>;
  /** Files an admin has to look at: not recognised, in conflict, or failed. */
  attention: number;
}

const LOCATION_INCLUDE = {
  storagePool: { select: { id: true, name: true } },
  encodingProfile: { select: { id: true, name: true } },
} satisfies Prisma.WatchLocationInclude;
type LocationRecord = Prisma.WatchLocationGetPayload<{ include: typeof LOCATION_INCLUDE }>;

const FILE_INCLUDE = {
  location: { select: { id: true, name: true } },
  title: { select: { id: true, type: true, name: true } },
  episode: { select: { id: true, name: true } },
  asset: { select: { id: true, status: true } },
} satisfies Prisma.WatchedFileInclude;
type FileRecord = Prisma.WatchedFileGetPayload<{ include: typeof FILE_INCLUDE }>;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function toFileView(file: FileRecord): WatchedFileView {
  return {
    id: file.id,
    location: file.location,
    path: file.path,
    size: file.size.toString(),
    modifiedAt: file.modifiedAt,
    state: file.state,
    metadataId: file.metadataId,
    seasonNumber: file.seasonNumber,
    episodeNumber: file.episodeNumber,
    matchedByHand: file.matchedByHand,
    title: file.title,
    episode: file.episode,
    asset: file.asset && file.asset.status !== 'DELETED' ? file.asset : null,
    publishPending: file.publishPending,
    note: file.note,
    firstSeenAt: file.firstSeenAt,
    importedAt: file.importedAt,
  };
}

/** Watched locations and their files, as admins see and steer them. */
@Injectable()
export class WatchService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(SecretBox) private readonly secretBox: SecretBox,
    @Inject(EventPublisher) private readonly events: EventPublisher,
  ) {}

  // --- Locations ------------------------------------------------------------------

  private async counts(
    locationIds?: readonly string[],
  ): Promise<Map<string, Partial<Record<WatchedFileState, number>>>> {
    const groups = await this.prisma.watchedFile.groupBy({
      by: ['locationId', 'state'],
      where: locationIds ? { locationId: { in: [...locationIds] } } : undefined,
      _count: { _all: true },
    });
    const byLocation = new Map<string, Partial<Record<WatchedFileState, number>>>();
    for (const group of groups) {
      const counts = byLocation.get(group.locationId) ?? {};
      counts[group.state] = group._count._all;
      byLocation.set(group.locationId, counts);
    }
    return byLocation;
  }

  private view(
    location: LocationRecord,
    counts: Partial<Record<WatchedFileState, number>> = {},
  ): LocationView {
    return {
      id: location.id,
      name: location.name,
      driver: location.driver,
      config: toPublicConfig(location.driver, location.config),
      isActive: location.isActive,
      scanIntervalMinutes: location.scanIntervalMinutes,
      storagePool: location.storagePool,
      processingMode: location.processingMode,
      encodingProfile: location.encodingProfile,
      autoPublish: location.autoPublish,
      afterImport: location.afterImport,
      lastScanAt: location.lastScanAt,
      lastScanError: location.lastScanError,
      scanRequested: location.scanRequestedAt !== null,
      counts,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    };
  }

  async listLocations(): Promise<LocationView[]> {
    const [locations, counts] = await Promise.all([
      this.prisma.watchLocation.findMany({ include: LOCATION_INCLUDE, orderBy: { name: 'asc' } }),
      this.counts(),
    ]);
    return locations.map((location) => this.view(location, counts.get(location.id)));
  }

  /** @throws NotFoundException when the location does not exist. */
  async getLocation(id: string): Promise<LocationView> {
    const location = await this.prisma.watchLocation.findUnique({
      where: { id },
      include: LOCATION_INCLUDE,
    });
    if (!location) {
      throw new NotFoundException('Watched location not found');
    }
    return this.view(location, (await this.counts([id])).get(id));
  }

  private async assertTargets(input: {
    storagePoolId?: string | null;
    encodingProfileId?: string | null;
  }): Promise<void> {
    if (input.storagePoolId) {
      const pool = await this.prisma.storagePool.findUnique({
        where: { id: input.storagePoolId },
        select: { isActive: true },
      });
      if (!pool) {
        throw new BadRequestException('The storage pool does not exist');
      }
      if (!pool.isActive) {
        throw new BadRequestException('The storage pool is not active');
      }
    }
    if (input.encodingProfileId) {
      const found = await this.prisma.encodingProfile.count({
        where: { id: input.encodingProfileId },
      });
      if (found === 0) {
        throw new BadRequestException('The encoding profile does not exist');
      }
    }
  }

  async createLocation(input: CreateLocationInput): Promise<LocationView> {
    await this.assertTargets(input);
    const { driver, config: place, ...settings } = input;
    const config: LocalConfig | S3StoredConfig =
      input.driver === 'LOCAL' ? input.config : encryptS3Config(input.config, this.secretBox);
    void place;
    try {
      const location = await this.prisma.watchLocation.create({
        data: { ...settings, driver, config },
        select: { id: true },
      });
      this.events.publish({ type: 'watch', locationId: location.id });
      return await this.getLocation(location.id);
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('A watched location with this name already exists')
        : error;
    }
  }

  async updateLocation(id: string, input: UpdateLocationInput): Promise<LocationView> {
    const current = await this.prisma.watchLocation.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Watched location not found');
    }
    await this.assertTargets(input);
    const { config: change, ...settings } = input;
    let config: LocalConfig | S3StoredConfig | undefined;
    if (change !== undefined) {
      if (current.driver === 'LOCAL') {
        const parsed = localConfigSchema.safeParse(change);
        if (!parsed.success) {
          throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Not a valid folder');
        }
        config = parsed.data;
      } else {
        const parsed = s3ConfigUpdateSchema.safeParse(change);
        if (!parsed.success) {
          throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Not valid settings');
        }
        config = mergeS3Config(
          parseStoredConfig('S3', current.config),
          parsed.data,
          this.secretBox,
        );
      }
    }
    try {
      await this.prisma.watchLocation.update({
        where: { id },
        data: { ...settings, ...(config ? { config } : {}) },
      });
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('A watched location with this name already exists')
        : error;
    }
    this.events.publish({ type: 'watch', locationId: id });
    return this.getLocation(id);
  }

  /** Forgets a location and what is known about its files. The files themselves stay. */
  async removeLocation(id: string): Promise<{ name: string }> {
    const location = await this.getLocation(id);
    const busy = await this.prisma.watchedFile.count({
      where: { locationId: id, state: 'IMPORTING' },
    });
    if (busy > 0) {
      throw new ConflictException('A file of this location is being imported. Try again shortly');
    }
    await this.prisma.watchLocation.delete({ where: { id } });
    this.events.publish({ type: 'watch', locationId: id });
    return { name: location.name };
  }

  /** Asks for a look at a location now, not when its interval says. */
  async requestScan(id: string): Promise<LocationView> {
    const location = await this.getLocation(id);
    if (!location.isActive) {
      throw new ConflictException('The location is paused. Turn it on to look through it');
    }
    await this.prisma.watchLocation.update({
      where: { id },
      data: { scanRequestedAt: new Date() },
    });
    this.events.publish({ type: 'watch', locationId: id });
    return this.getLocation(id);
  }

  /**
   * Looks at a place without saving anything: can it be read, and what is in
   * it. For the form that adds a location.
   *
   * @throws BadRequestException when the place cannot be read, with the reason.
   */
  async testPlace(place: LocationPlace): Promise<PlaceTest> {
    if (place.driver === 'LOCAL') {
      const info = await stat(place.config.basePath).catch(() => null);
      if (!info) {
        throw new BadRequestException(
          `The folder ${place.config.basePath} does not exist on the server. With Docker, it has to be mounted into the API container`,
        );
      }
      if (!info.isDirectory()) {
        throw new BadRequestException(`${place.config.basePath} is a file, not a folder`);
      }
    }
    const driver = this.storage.createDriver({
      driver: place.driver,
      config:
        place.driver === 'LOCAL' ? place.config : encryptS3Config(place.config, this.secretBox),
    });
    const result: PlaceTest = {
      files: 0,
      videos: 0,
      recognised: 0,
      capped: false,
      // A bucket shows this only when something is written. A folder can be asked.
      writable:
        place.driver !== 'LOCAL' ||
        (await access(place.config.basePath, constants.W_OK).then(
          () => true,
          () => false,
        )),
      samples: [],
    };
    try {
      for await (const entry of driver.listAll()) {
        if (result.files >= TEST_LIMIT) {
          result.capped = true;
          break;
        }
        result.files += 1;
        if (!isCandidate(entry.key)) {
          continue;
        }
        result.videos += 1;
        const parsed = parseWatchedName(entry.key);
        result.recognised += parsed ? 1 : 0;
        if (result.samples.length < TEST_SAMPLES) {
          result.samples.push({
            path: entry.key,
            recognisedAs: parsed
              ? parsed.seasonNumber === null
                ? `Movie ${parsed.metadataId.slice(6)}`
                : `Series ${parsed.metadataId.slice(3)}, season ${parsed.seasonNumber}, episode ${parsed.episodeNumber}`
              : null,
          });
        }
      }
    } catch (error) {
      throw new BadRequestException(
        `The place could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await driver.close?.();
    }
    return result;
  }

  // --- Files ----------------------------------------------------------------------

  async listFiles(input: ListFilesInput): Promise<Page<WatchedFileView>> {
    const where: Prisma.WatchedFileWhereInput = {
      locationId: input.locationId,
      state: input.state,
      ...(input.q ? { path: { contains: input.q, mode: 'insensitive' } } : {}),
    };
    const [files, total] = await Promise.all([
      this.prisma.watchedFile.findMany({
        where,
        include: FILE_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(input),
      }),
      this.prisma.watchedFile.count({ where }),
    ]);
    return toPage(files.map(toFileView), total, input);
  }

  async summary(): Promise<WatchSummary> {
    const [locations, groups] = await Promise.all([
      this.prisma.watchLocation.count(),
      this.prisma.watchedFile.groupBy({ by: ['state'], _count: { _all: true } }),
    ]);
    const counts: Partial<Record<WatchedFileState, number>> = {};
    for (const state of WATCHED_FILE_STATES) {
      const found = groups.find((group) => group.state === state)?._count._all;
      if (found) {
        counts[state] = found;
      }
    }
    return {
      locations,
      counts,
      attention: (counts.UNRECOGNISED ?? 0) + (counts.CONFLICT ?? 0) + (counts.FAILED ?? 0),
    };
  }

  private async file(id: string): Promise<FileRecord> {
    const file = await this.prisma.watchedFile.findUnique({ where: { id }, include: FILE_INCLUDE });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return file;
  }

  private async change(
    id: string,
    from: readonly WatchedFileState[],
    data: Prisma.WatchedFileUncheckedUpdateInput,
    refusal: string,
  ): Promise<WatchedFileView> {
    const file = await this.file(id);
    // The state is checked again in the update, so a file that has just been picked up stays put.
    const updated = await this.prisma.watchedFile.updateMany({
      where: { id, state: { in: [...from] } },
      data,
    });
    if (updated.count === 0) {
      throw new ConflictException(refusal);
    }
    this.events.publish({ type: 'watch', locationId: file.location.id });
    return toFileView(await this.file(id));
  }

  /** Says what a file is, and queues it. */
  matchFile(id: string, input: MatchFileInput): Promise<WatchedFileView> {
    return this.change(
      id,
      ['UNRECOGNISED', 'FAILED', 'CONFLICT', 'IGNORED', 'QUEUED'],
      {
        state: 'QUEUED',
        metadataId: `${input.kind === 'MOVIE' ? 'movie' : 'tv'}:${input.tmdbId}`,
        seasonNumber: input.seasonNumber ?? null,
        episodeNumber: input.episodeNumber ?? null,
        matchedByHand: true,
        replace: false,
        note: null,
      },
      'This file cannot be matched now: it is being imported, or it is imported already',
    );
  }

  /** Queues a file again after a failure or a conflict. */
  async retryFile(id: string, input: RetryFileInput): Promise<WatchedFileView> {
    const file = await this.file(id);
    if (!file.metadataId) {
      if (file.state !== 'IGNORED') {
        throw new ConflictException('Nobody has said what this file is yet. Match it first');
      }
      // Set aside before its name was read: it is looked at again like a new file.
      return this.change(id, ['IGNORED'], { state: 'WAITING', note: null }, 'Try again');
    }
    return this.change(
      id,
      ['FAILED', 'CONFLICT', 'IGNORED'],
      { state: 'QUEUED', replace: input.replace, note: null },
      'Only a file that failed, is in conflict or was set aside can be tried again',
    );
  }

  /** Queues every failed file again. */
  async retryAll(input: RetryAllInput): Promise<{ queued: number }> {
    const updated = await this.prisma.watchedFile.updateMany({
      where: { state: 'FAILED', metadataId: { not: null }, locationId: input.locationId },
      data: { state: 'QUEUED', note: null },
    });
    this.events.publish({ type: 'watch', locationId: input.locationId ?? null });
    return { queued: updated.count };
  }

  /** Sets a file aside: it stays where it is and is not imported. */
  ignoreFile(id: string): Promise<WatchedFileView> {
    return this.change(
      id,
      ['UNRECOGNISED', 'FAILED', 'CONFLICT', 'QUEUED', 'WAITING'],
      { state: 'IGNORED', note: null },
      'This file cannot be set aside now: it is being imported, or it is imported already',
    );
  }
}
