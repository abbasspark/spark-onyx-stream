// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type GuideSource, PrismaClient, type Programme } from '@onyx/database';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { SecretBox } from '../crypto/secret-box.js';
import type {
  CreateProgrammeInput,
  CreateSourceInput,
  ProgrammeWindow,
  UpdateProgrammeInput,
  UpdateSourceInput,
} from './guide.schemas.js';

export interface GuideSourceView {
  id: string;
  name: string;
  /** The address without anything secret. */
  url: string;
  enabled: boolean;
  /** The last import. Null before the first one. */
  lastRun: { at: string; ok: boolean; message: string } | null;
  /** Programmes it holds for channels of this installation. */
  programmes: number;
  /** Channels its file lists. */
  channels: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProgrammeView {
  id: string;
  channelId: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  startsAt: string;
  endsAt: string;
  /** The source it was imported from. Null for one an admin entered, which can be changed. */
  source: { id: string; name: string } | null;
}

/** A channel some guide source knows, to link a channel to. */
export interface KnownGuideChannel {
  guideId: string;
  name: string;
  source: string;
}

type SourceRecord = GuideSource & { _count: { programmes: number; channels: number } };
const SOURCE_INCLUDE = { _count: { select: { programmes: true, channels: true } } } as const;
const PROGRAMME_INCLUDE = { source: { select: { id: true, name: true } } } as const;
type ProgrammeRecord = Programme & { source: { id: string; name: string } | null };

/** Guide sources and the programmes of channels, for admins. */
@Injectable()
export class GuideService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SecretBox) private readonly secrets: SecretBox,
  ) {}

  // --- Sources ---------------------------------------------------------------

  async listSources(): Promise<GuideSourceView[]> {
    const sources = await this.prisma.guideSource.findMany({
      orderBy: { name: 'asc' },
      include: SOURCE_INCLUDE,
    });
    return sources.map(toSourceView);
  }

  async getSource(id: string): Promise<GuideSourceView> {
    const source = await this.prisma.guideSource.findUnique({
      where: { id },
      include: SOURCE_INCLUDE,
    });
    if (!source) {
      throw new NotFoundException('Guide source not found');
    }
    return toSourceView(source);
  }

  /** The full address of a source, for the edit form. It may carry a token. */
  async sourceUrl(id: string): Promise<{ url: string }> {
    const source = await this.prisma.guideSource.findUnique({ where: { id } });
    if (!source) {
      throw new NotFoundException('Guide source not found');
    }
    return { url: this.secrets.decrypt(source.urlEncrypted) };
  }

  async createSource(input: CreateSourceInput): Promise<GuideSourceView> {
    try {
      const source = await this.prisma.guideSource.create({
        data: {
          name: input.name,
          urlEncrypted: this.secrets.encrypt(input.url),
          urlLabel: labelOf(input.url),
          enabled: input.enabled,
        },
        include: SOURCE_INCLUDE,
      });
      return toSourceView(source);
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('Another guide source has this name')
        : error;
    }
  }

  async updateSource(id: string, input: UpdateSourceInput): Promise<GuideSourceView> {
    await this.getSource(id);
    try {
      const source = await this.prisma.guideSource.update({
        where: { id },
        data: {
          name: input.name,
          enabled: input.enabled,
          ...(input.url === undefined
            ? {}
            : { urlEncrypted: this.secrets.encrypt(input.url), urlLabel: labelOf(input.url) }),
        },
        include: SOURCE_INCLUDE,
      });
      return toSourceView(source);
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('Another guide source has this name')
        : error;
    }
  }

  /** Deletes a source with everything it brought. */
  async removeSource(id: string): Promise<GuideSourceView> {
    const source = await this.getSource(id);
    await this.prisma.guideSource.delete({ where: { id } });
    return source;
  }

  /** Channels the sources know, to pick the one a channel here is. */
  async searchKnown(query: string): Promise<KnownGuideChannel[]> {
    const rows = await this.prisma.guideSourceChannel.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { guideId: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: [{ name: 'asc' }, { guideId: 'asc' }],
      take: 50,
      select: { guideId: true, name: true, source: { select: { name: true } } },
    });
    return rows.map((row) => ({ guideId: row.guideId, name: row.name, source: row.source.name }));
  }

  // --- Programmes ------------------------------------------------------------

  /** The programmes of a channel that run at some point in a stretch of time. */
  async listProgrammes(channelId: string, window: ProgrammeWindow): Promise<ProgrammeView[]> {
    await this.assertChannel(channelId);
    const programmes = await this.prisma.programme.findMany({
      where: { channelId, startsAt: { lt: window.to }, endsAt: { gt: window.from } },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      include: PROGRAMME_INCLUDE,
      take: 2000,
    });
    return programmes.map(toProgrammeView);
  }

  async createProgramme(channelId: string, input: CreateProgrammeInput): Promise<ProgrammeView> {
    await this.assertChannel(channelId);
    const programme = await this.prisma.programme.create({
      data: { channelId, ...input },
      include: PROGRAMME_INCLUDE,
    });
    return toProgrammeView(programme);
  }

  /** @throws BadRequestException for an imported programme: the next import would undo the change. */
  async updateProgramme(id: string, input: UpdateProgrammeInput): Promise<ProgrammeView> {
    const current = await this.findOwn(id);
    const startsAt = input.startsAt ?? current.startsAt;
    const endsAt = input.endsAt ?? current.endsAt;
    const length = endsAt.getTime() - startsAt.getTime();
    if (length <= 0) {
      throw new BadRequestException('The end must be after the start');
    }
    if (length > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('A programme lasts a day at most');
    }
    const programme = await this.prisma.programme.update({
      where: { id },
      data: input,
      include: PROGRAMME_INCLUDE,
    });
    return toProgrammeView(programme);
  }

  async removeProgramme(id: string): Promise<ProgrammeView> {
    const programme = await this.findOwn(id);
    await this.prisma.programme.delete({ where: { id } });
    return toProgrammeView(programme);
  }

  private async findOwn(id: string): Promise<ProgrammeRecord> {
    const programme = await this.prisma.programme.findUnique({
      where: { id },
      include: PROGRAMME_INCLUDE,
    });
    if (!programme) {
      throw new NotFoundException('Programme not found');
    }
    if (programme.sourceId !== null) {
      throw new BadRequestException(
        `This programme comes from "${programme.source?.name ?? 'a guide source'}" and is replaced with every import. Change it there`,
      );
    }
    return programme;
  }

  private async assertChannel(channelId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
  }
}

/** An address without user name, password and query, where tokens usually are. */
export function labelOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

function toSourceView(source: SourceRecord): GuideSourceView {
  return {
    id: source.id,
    name: source.name,
    url: source.urlLabel,
    enabled: source.enabled,
    lastRun:
      source.lastRunAt && source.lastOk !== null
        ? {
            at: source.lastRunAt.toISOString(),
            ok: source.lastOk,
            message: source.lastMessage ?? '',
          }
        : null,
    programmes: source._count.programmes,
    channels: source._count.channels,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function toProgrammeView(programme: ProgrammeRecord): ProgrammeView {
  return {
    id: programme.id,
    channelId: programme.channelId,
    title: programme.title,
    subtitle: programme.subtitle,
    description: programme.description,
    category: programme.category,
    startsAt: programme.startsAt.toISOString(),
    endsAt: programme.endsAt.toISOString(),
    source: programme.source,
  };
}
