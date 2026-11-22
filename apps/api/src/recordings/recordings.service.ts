// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AssetStatus,
  PrismaClient,
  type Recording,
  type RecordingStatus,
} from '@onyx/database';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { EventPublisher } from '../events/event-publisher.js';
import {
  type CreateRecordingInput,
  type ListRecordingsQuery,
  timesProblem,
} from './recordings.schemas.js';

export interface RecordingView {
  id: string;
  title: string;
  channel: { id: string | null; name: string };
  startsAt: string;
  endsAt: string;
  status: RecordingStatus;
  statusMessage: string | null;
  /** How much was really recorded. Null until it is known. */
  recordedSeconds: number | null;
  bytes: string | null;
  /** What it became in the library, and how far that is processed. */
  asset: { id: string; status: AssetStatus } | null;
  createdAt: string;
}

const INCLUDE = { asset: { select: { id: true, status: true } } } as const;
type RecordingRecord = Recording & { asset: { id: string; status: AssetStatus } | null };

const OPEN: RecordingStatus[] = ['SCHEDULED', 'RECORDING', 'FINISHING'];

/** Recordings of live channels, for admins. The live processes make them. */
@Injectable()
export class RecordingsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(EventPublisher) private readonly events: EventPublisher,
  ) {}

  async list(query: ListRecordingsQuery): Promise<Page<RecordingView>> {
    const where =
      query.show === 'open'
        ? { status: { in: OPEN } }
        : query.show === 'finished'
          ? { status: { notIn: OPEN } }
          : {};
    const [items, total] = await Promise.all([
      this.prisma.recording.findMany({
        where,
        // What is being made and what comes next first, then the newest.
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
        include: INCLUDE,
        ...toSkipTake(query),
      }),
      this.prisma.recording.count({ where }),
    ]);
    return toPage(items.map(toView), total, query);
  }

  async create(input: CreateRecordingInput, adminId: string | null): Promise<RecordingView> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: input.channelId },
      select: { id: true, name: true },
    });
    if (!channel) {
      throw new BadRequestException('The channel does not exist');
    }
    return this.schedule(channel, input.title, input.startsAt, input.endsAt, adminId);
  }

  /** Records a programme of the guide, under its title and for its time. */
  async createFromProgramme(programmeId: string, adminId: string | null): Promise<RecordingView> {
    const programme = await this.prisma.programme.findUnique({
      where: { id: programmeId },
      include: { channel: { select: { id: true, name: true } } },
    });
    if (!programme) {
      throw new NotFoundException('Programme not found');
    }
    const problem = timesProblem(programme.startsAt, programme.endsAt);
    if (problem) {
      throw new BadRequestException(problem.message);
    }
    const title = programme.subtitle
      ? `${programme.title}: ${programme.subtitle}`.slice(0, 200)
      : programme.title;
    return this.schedule(programme.channel, title, programme.startsAt, programme.endsAt, adminId);
  }

  /**
   * Ends a recording early. One that is waiting is called off. One that is
   * being made stops now and keeps what it has.
   */
  async stop(id: string): Promise<RecordingView> {
    const recording = await this.find(id);
    if (recording.status === 'SCHEDULED' && recording.startsAt > new Date()) {
      return this.update(id, { status: 'CANCELLED' });
    }
    if (recording.status === 'SCHEDULED' || recording.status === 'RECORDING') {
      // The live process sees the new end and finishes the file.
      return this.update(id, { endsAt: new Date() });
    }
    throw new ConflictException('This recording is already finished');
  }

  /**
   * Removes a recording from the list. What it became in the library stays:
   * that is deleted there. A recording that is being made is thrown away.
   */
  async remove(id: string): Promise<RecordingView> {
    const recording = await this.find(id);
    if (recording.status === 'FINISHING') {
      throw new ConflictException(
        'This recording is being put into the library. Try again in a moment',
      );
    }
    await this.prisma.recording.delete({ where: { id } });
    this.events.publish({ type: 'recording', recordingId: id });
    return toView(recording);
  }

  private async schedule(
    channel: { id: string; name: string },
    title: string,
    startsAt: Date,
    endsAt: Date,
    adminId: string | null,
  ): Promise<RecordingView> {
    const twin = await this.prisma.recording.findFirst({
      where: { channelId: channel.id, startsAt, endsAt, status: { in: OPEN } },
      select: { id: true },
    });
    if (twin) {
      throw new ConflictException('This is already being recorded');
    }
    const recording = await this.prisma.recording.create({
      data: {
        title,
        channelId: channel.id,
        channelName: channel.name,
        startsAt,
        endsAt,
        createdById: adminId,
      },
      include: INCLUDE,
    });
    this.events.publish({ type: 'recording', recordingId: recording.id });
    return toView(recording);
  }

  private async update(
    id: string,
    data: { status?: RecordingStatus; endsAt?: Date },
  ): Promise<RecordingView> {
    const recording = await this.prisma.recording.update({ where: { id }, data, include: INCLUDE });
    this.events.publish({ type: 'recording', recordingId: id });
    return toView(recording);
  }

  private async find(id: string): Promise<RecordingRecord> {
    const recording = await this.prisma.recording.findUnique({ where: { id }, include: INCLUDE });
    if (!recording) {
      throw new NotFoundException('Recording not found');
    }
    return recording;
  }
}

function toView(recording: RecordingRecord): RecordingView {
  return {
    id: recording.id,
    title: recording.title,
    channel: { id: recording.channelId, name: recording.channelName },
    startsAt: recording.startsAt.toISOString(),
    endsAt: recording.endsAt.toISOString(),
    status: recording.status,
    statusMessage: recording.statusMessage,
    recordedSeconds: recording.recordedSeconds,
    bytes: recording.bytes === null ? null : recording.bytes.toString(),
    asset: recording.asset,
    createdAt: recording.createdAt.toISOString(),
  };
}
