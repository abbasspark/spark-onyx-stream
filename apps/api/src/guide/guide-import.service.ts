// SPDX-License-Identifier: AGPL-3.0-only
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type GuideSource, PrismaClient } from '@onyx/database';
import { isForbiddenAddress } from '../common/outbound-address.js';
import { SecretBox } from '../crypto/secret-box.js';
import { readXmltv, type XmltvChannel, XmltvError, type XmltvProgramme } from './xmltv.js';

/** Time a guide file gets to arrive and be read. */
const IMPORT_TIMEOUT_MS = 3 * 60_000;
/** A file that unpacks to more than this is not read to its end. */
const MAX_BYTES = 400 * 1024 * 1024;
/** Programmes that ended longer ago, or start later, than this are left out. */
export const KEEP_PAST_MS = 6 * 60 * 60 * 1000;
export const KEEP_AHEAD_MS = 14 * 24 * 60 * 60 * 1000;
/** Upper limits, so a broken file cannot fill the database. */
const MAX_PROGRAMMES = 400_000;
const MAX_CHANNELS = 20_000;
const INSERT_BATCH = 2000;

export interface ImportResult {
  ok: boolean;
  message: string;
  /** Programmes written for channels of this installation. */
  programmes: number;
  /** Channels the file lists, and how many of them a channel here is linked to. */
  channels: number;
  linked: number;
}

/** Opens the file of a guide source. Replaced in tests. */
export type GuideFetcher = (url: string, signal: AbortSignal) => Promise<AsyncIterable<Uint8Array>>;

/** How many times a guide address may send the import somewhere else. */
const MAX_REDIRECTS = 5;

/**
 * Refuses an address that would send the request to the machine itself.
 *
 * A guide often sits on the same network as the installation, so private
 * addresses are allowed. What is never called is the place where a cloud
 * hands out credentials to whoever asks from inside the machine.
 *
 * @throws XmltvError when the address must not be called.
 */
async function checkAddress(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new XmltvError('A guide is fetched over http or https');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((e) => e.address);
  for (const address of addresses) {
    if (isForbiddenAddress(address)) {
      throw new XmltvError(
        isIP(host)
          ? 'This address is reserved for the machine itself and is not fetched'
          : `${host} leads to ${address}, which is reserved for the machine itself`,
      );
    }
  }
}

/**
 * Fetches a guide file over HTTP, unpacking it when it is gzipped.
 *
 * Every address is checked before it is called, redirects included: the
 * address comes from the panel and would otherwise be a way to reach
 * whatever the server itself can reach.
 */
export const fetchGuide: GuideFetcher = async (url, signal) => {
  let target = new URL(url);
  let response: Response;
  for (let hop = 0; ; hop += 1) {
    await checkAddress(target);
    response = await fetch(target, {
      signal,
      redirect: 'manual',
      headers: {
        Accept: 'application/xml, text/xml, */*',
        'User-Agent': 'OnyxStream guide import',
      },
    });
    const location =
      response.status >= 300 && response.status < 400 && response.headers.get('location');
    if (!location) {
      break;
    }
    if (hop >= MAX_REDIRECTS) {
      throw new XmltvError('The address of the guide sends the import in circles');
    }
    try {
      target = new URL(location, target);
    } catch {
      throw new XmltvError('The server of the guide pointed at an address that cannot be read');
    }
  }
  if (!response.ok || !response.body) {
    throw new XmltvError(`The server of the guide answered ${response.status}`);
  }
  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  return unpack(body);
};

/**
 * Hands a file on as it is, or unpacked when it starts like a gzip file.
 * Guides are large and nearly always offered packed, whatever their name says.
 */
export async function* unpack(body: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) {
    return;
  }
  const rest = (async function* () {
    yield first.value;
    for (;;) {
      const next = await iterator.next();
      if (next.done) {
        return;
      }
      yield next.value;
    }
  })();

  const gzipped = first.value.length >= 2 && first.value[0] === 0x1f && first.value[1] === 0x8b;
  yield* gzipped ? Readable.from(rest).pipe(createGunzip()) : rest;
}

/** Imports the programme guide from XMLTV files. */
@Injectable()
export class GuideImportService {
  private readonly logger = new Logger(GuideImportService.name);
  /** Sources being imported in this process, so one is not imported twice at once. */
  private readonly running = new Map<string, Promise<ImportResult>>();
  /** Set by tests to read from memory instead of the network. */
  fetcher: GuideFetcher = fetchGuide;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SecretBox) private readonly secrets: SecretBox,
  ) {}

  /**
   * Imports one source and records how it went. A failure is a result, not
   * an error: the programmes of the last good import stay in place.
   *
   * @throws NotFoundException when the source does not exist.
   */
  async run(sourceId: string): Promise<ImportResult> {
    const already = this.running.get(sourceId);
    if (already) {
      return already;
    }
    const source = await this.prisma.guideSource.findUnique({ where: { id: sourceId } });
    if (!source) {
      throw new NotFoundException('Guide source not found');
    }
    const work = this.import(source).finally(() => this.running.delete(sourceId));
    this.running.set(sourceId, work);
    return work;
  }

  private async import(source: GuideSource): Promise<ImportResult> {
    let result: ImportResult;
    try {
      result = await this.read(source);
    } catch (error) {
      const message =
        error instanceof XmltvError
          ? error.message
          : (error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError'
            ? 'The file did not arrive within three minutes'
            : `The file could not be fetched: ${describe(error)}`;
      result = { ok: false, message, programmes: 0, channels: 0, linked: 0 };
      this.logger.warn(`Guide source "${source.name}": ${message}`);
    }
    await this.prisma.guideSource
      .update({
        where: { id: source.id },
        data: {
          lastRunAt: new Date(),
          lastOk: result.ok,
          lastMessage: result.message,
          ...(result.ok ? { lastProgrammes: result.programmes } : {}),
        },
      })
      // The source was deleted while its file was read.
      .catch(() => undefined);
    return result;
  }

  private async read(source: GuideSource): Promise<ImportResult> {
    const linked = await this.prisma.channel.findMany({
      where: { guideId: { not: null } },
      select: { id: true, guideId: true },
    });
    const channelsOf = new Map<string, string[]>();
    for (const channel of linked) {
      const ids = channelsOf.get(channel.guideId as string) ?? [];
      ids.push(channel.id);
      channelsOf.set(channel.guideId as string, ids);
    }

    const now = Date.now();
    const from = now - KEEP_PAST_MS;
    const until = now + KEEP_AHEAD_MS;
    const known = new Map<string, XmltvChannel>();
    const programmes: (XmltvProgramme & { channelId: string })[] = [];
    let bytes = 0;

    const file = await this.fetcher(
      this.secrets.decrypt(source.urlEncrypted),
      AbortSignal.timeout(IMPORT_TIMEOUT_MS),
    );
    const counted = (async function* () {
      for await (const chunk of file) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          throw new XmltvError('The file is larger than 400 MB unpacked');
        }
        yield chunk;
      }
    })();

    await readXmltv(counted, {
      onChannel: (channel) => {
        if (known.size < MAX_CHANNELS) {
          known.set(channel.id, channel);
        }
      },
      onProgramme: (programme) => {
        const targets = channelsOf.get(programme.channel);
        if (!targets || programme.endsAt.getTime() < from || programme.startsAt.getTime() > until) {
          return true;
        }
        for (const channelId of targets) {
          programmes.push({ ...programme, channelId });
        }
        return programmes.length < MAX_PROGRAMMES;
      },
    });

    const matched = [...known.keys()].filter((id) => channelsOf.has(id)).length;
    // What the source brought before is replaced as a whole, so nothing it dropped stays behind.
    await this.prisma.$transaction(
      async (tx) => {
        await tx.programme.deleteMany({ where: { sourceId: source.id } });
        for (let index = 0; index < programmes.length; index += INSERT_BATCH) {
          await tx.programme.createMany({
            data: programmes.slice(index, index + INSERT_BATCH).map((programme) => ({
              channelId: programme.channelId,
              sourceId: source.id,
              title: programme.title,
              subtitle: programme.subtitle,
              description: programme.description,
              category: programme.category,
              startsAt: programme.startsAt,
              endsAt: programme.endsAt,
            })),
          });
        }
        await tx.guideSourceChannel.deleteMany({ where: { sourceId: source.id } });
        const listed = [...known.values()];
        for (let index = 0; index < listed.length; index += INSERT_BATCH) {
          await tx.guideSourceChannel.createMany({
            data: listed.slice(index, index + INSERT_BATCH).map((channel) => ({
              sourceId: source.id,
              guideId: channel.id,
              name: channel.name,
            })),
          });
        }
      },
      { timeout: 120_000 },
    );

    const message =
      known.size === 0
        ? 'The file lists no channels'
        : matched === 0
          ? `The file lists ${known.size} channels. None of your channels is linked to one of them yet`
          : `${programmes.length} programmes for ${matched} of your channels`;
    return {
      ok: true,
      message,
      programmes: programmes.length,
      channels: known.size,
      linked: matched,
    };
  }
}

function describe(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  return cause?.code ?? cause?.message ?? (error as Error).message;
}
