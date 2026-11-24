// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@onyx/database';
import { runningAt } from '../billing/entitlement.js';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { SecretBox } from '../crypto/secret-box.js';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service.js';
import {
  type CodeState,
  codeState,
  csvLine,
  endingOf,
  formatCode,
  generateCode,
  hashCode,
  isCodeShaped,
  maskCode,
  planRedemption,
  type RefusalCode,
} from './code-rules.js';
import type {
  CreateBatchInput,
  ListBatchesInput,
  ListCodesInput,
  UpdateBatchInput,
} from './prepaid.schemas.js';

/** Codes written to the database in one go. */
const CHUNK = 500;

export interface BatchView {
  id: string;
  name: string;
  plan: { id: string; name: string };
  days: number;
  expiresAt: Date | null;
  voidedAt: Date | null;
  note: string | null;
  createdAt: Date;
  /** "open": codes can be used. "expired": their time ran out. "withdrawn": an admin took them back. */
  state: 'open' | 'expired' | 'withdrawn';
  /** How many codes it holds, and what became of them. */
  total: number;
  redeemed: number;
  withdrawn: number;
  /** Codes that can still be used right now. */
  left: number;
  lastRedeemedAt: Date | null;
}

export interface CodeView {
  id: string;
  /** Hidden but for its last four characters. */
  masked: string;
  state: CodeState;
  redeemedAt: Date | null;
  redeemedBy: { id: string; email: string; displayName: string } | null;
}

/** All batches together, for the head of the page. */
export interface PrepaidSummary {
  batches: number;
  codes: number;
  redeemed: number;
  /** Codes that can still be used right now. */
  left: number;
  /** Viewers who watch through a prepaid code right now. */
  subscribers: number;
  /** Codes used on each of the last thirty days, the oldest first. Days are in UTC. */
  days: { day: string; redeemed: number }[];
}

/** A code found by typing it in, for an admin who helps a viewer. */
export interface CodeLookup extends CodeView {
  code: string;
  batch: { id: string; name: string; plan: string; days: number; expiresAt: Date | null };
}

/** What a code would do for the account that asks. */
export interface CodePreview {
  plan: { id: string; name: string };
  days: number;
  /** "start": the plan begins now. "extend": the days are added to what is running. */
  action: 'start' | 'extend';
  /** Until when the account can watch afterwards. */
  endsAt: Date;
}

export interface Redeemed extends CodePreview {
  subscriptionId: string;
}

const BATCH_INCLUDE = {
  plan: { select: { id: true, name: true } },
} satisfies Prisma.PrepaidBatchInclude;
type BatchRecord = Prisma.PrepaidBatchGetPayload<{ include: typeof BATCH_INCLUDE }>;

const REFUSAL_STATUS: Record<RefusalCode, number> = {
  not_found: HttpStatus.NOT_FOUND,
  used: HttpStatus.CONFLICT,
  expired: HttpStatus.GONE,
  withdrawn: HttpStatus.GONE,
  subscription_renews: HttpStatus.CONFLICT,
  subscription_open: HttpStatus.CONFLICT,
  other_plan: HttpStatus.CONFLICT,
};

/** A refusal with a word a client can act on, next to the sentence for the viewer. */
function refuse(code: RefusalCode, message: string): HttpException {
  const statusCode = REFUSAL_STATUS[code];
  return new HttpException({ statusCode, error: 'Code refused', message, code }, statusCode);
}

/**
 * Prepaid codes: made in batches by an admin, handed out outside the
 * platform, and used by a viewer to start a plan or to add days to it.
 *
 * A code is kept twice: as a hash it is found by, and encrypted with the
 * master key so that a batch can be handed out again. Whoever reads the
 * database alone has no code.
 */
@Injectable()
export class PrepaidService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SecretBox) private readonly secrets: SecretBox,
    @Inject(WebhookDeliveryService) private readonly webhooks: WebhookDeliveryService,
  ) {}

  // --- For viewers ---------------------------------------------------------------

  /**
   * What a code would do for an account, without using it.
   *
   * @throws HttpException with `code` when it cannot be used: see RefusalCode.
   */
  async preview(viewerId: string, raw: string, now: Date = new Date()): Promise<CodePreview> {
    const found = await this.usable(raw, now);
    const plan = planRedemption(await this.running(this.prisma, viewerId, now), found, now);
    if (plan.action === 'refuse') {
      throw refuse(plan.code, plan.message);
    }
    return {
      plan: { id: found.planId, name: found.planName },
      days: found.days,
      action: plan.action,
      endsAt: plan.endsAt,
    };
  }

  /**
   * Uses a code for an account. Either all of it happens or none: the code
   * is spent exactly when the plan starts or grows.
   *
   * @throws HttpException with `code` when it cannot be used.
   */
  async redeem(viewerId: string, raw: string, now: Date = new Date()): Promise<Redeemed> {
    const found = await this.usable(raw, now);
    const result = await this.prisma.$transaction(async (tx) => {
      // One at a time per account: two codes used in the same moment add up instead of colliding.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${viewerId}))`;
      const plan = planRedemption(await this.running(tx, viewerId, now), found, now);
      if (plan.action === 'refuse') {
        throw refuse(plan.code, plan.message);
      }
      // Whoever comes first gets it. Everybody after finds it used.
      const spent = await tx.prepaidCode.updateMany({
        where: { id: found.id, redeemedAt: null, voidedAt: null },
        data: { redeemedAt: now, redeemedById: viewerId },
      });
      if (spent.count !== 1) {
        throw refuse('used', 'This code was used already.');
      }
      const note = `Prepaid code ${maskCode(found.ending)} (${found.batchName})`;
      const subscription =
        plan.action === 'extend' && plan.subscriptionId
          ? await tx.subscription.update({
              where: { id: plan.subscriptionId },
              data: { endsAt: plan.endsAt },
              select: { id: true },
            })
          : await tx.subscription.create({
              data: {
                viewerId,
                planId: found.planId,
                status: 'ACTIVE',
                source: 'PREPAID',
                startedAt: now,
                endsAt: plan.endsAt,
                note,
              },
              select: { id: true },
            });
      await tx.prepaidCode.update({
        where: { id: found.id },
        data: { subscriptionId: subscription.id },
      });
      return { action: plan.action, endsAt: plan.endsAt, subscriptionId: subscription.id };
    });
    if (result.action === 'start') {
      await this.webhooks.announceSubscription('subscription.started', result.subscriptionId);
    }
    return {
      plan: { id: found.planId, name: found.planName },
      days: found.days,
      action: result.action,
      endsAt: result.endsAt,
      subscriptionId: result.subscriptionId,
    };
  }

  // --- For the panel ---------------------------------------------------------------

  /**
   * Makes a batch of codes.
   *
   * @throws BadRequestException when the plan does not exist.
   */
  async createBatch(input: CreateBatchInput, adminId: string | null): Promise<BatchView> {
    const plan = await this.prisma.plan.findUnique({
      where: { id: input.planId },
      select: { id: true },
    });
    if (!plan) {
      throw new BadRequestException('The plan does not exist');
    }
    if (input.expiresAt && Date.parse(input.expiresAt) <= Date.now()) {
      throw new BadRequestException('The last day the codes can be used is in the past');
    }
    const codes = new Set<string>();
    while (codes.size < input.count) {
      codes.add(generateCode());
    }
    const rows = [...codes].map((code) => ({
      codeHash: hashCode(code),
      codeBox: this.secrets.encrypt(code),
      ending: endingOf(code),
    }));
    const batch = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.prepaidBatch.create({
          data: {
            name: input.name,
            planId: input.planId,
            days: input.days,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            note: input.note || null,
            createdById: adminId,
          },
          select: { id: true },
        });
        for (let start = 0; start < rows.length; start += CHUNK) {
          await tx.prepaidCode.createMany({
            data: rows.slice(start, start + CHUNK).map((row) => ({ ...row, batchId: created.id })),
          });
        }
        return created;
      },
      { timeout: 60_000 },
    );
    return this.getBatch(batch.id);
  }

  /** What became of all codes, and how many were used lately. */
  async summary(now: Date = new Date()): Promise<PrepaidSummary> {
    const [counted] = await this.prisma.$queryRaw<
      { batches: number; codes: number; redeemed: number; left: number }[]
    >`
      SELECT (SELECT COUNT(*)::int FROM prepaid_batches) AS batches,
             COUNT(c.id)::int AS codes,
             (COUNT(c.id) FILTER (WHERE c."redeemedAt" IS NOT NULL))::int AS redeemed,
             (COUNT(c.id) FILTER (
               WHERE c."redeemedAt" IS NULL AND c."voidedAt" IS NULL AND b."voidedAt" IS NULL
                 AND (b."expiresAt" IS NULL OR b."expiresAt" > ${now})
             ))::int AS left
      FROM prepaid_codes c
      JOIN prepaid_batches b ON b.id = c."batchId"`;
    const since = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29),
    );
    const [perDay, subscribers] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; redeemed: number }[]>`
        SELECT to_char(date_trunc('day', "redeemedAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS redeemed
        FROM prepaid_codes
        WHERE "redeemedAt" >= ${since}
        GROUP BY 1`,
      this.prisma.subscription.count({ where: { ...runningAt(now), source: 'PREPAID' } }),
    ]);
    const byDay = new Map(perDay.map((row) => [row.day, row.redeemed]));
    const days = Array.from({ length: 30 }, (_unused, index) => {
      const day = new Date(since.getTime() + index * 86_400_000).toISOString().slice(0, 10);
      return { day, redeemed: byDay.get(day) ?? 0 };
    });
    return {
      batches: counted?.batches ?? 0,
      codes: counted?.codes ?? 0,
      redeemed: counted?.redeemed ?? 0,
      left: counted?.left ?? 0,
      subscribers,
      days,
    };
  }

  async listBatches(input: ListBatchesInput): Promise<Page<BatchView>> {
    const [rows, total] = await Promise.all([
      this.prisma.prepaidBatch.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: BATCH_INCLUDE,
        ...toSkipTake(input),
      }),
      this.prisma.prepaidBatch.count(),
    ]);
    return toPage(await this.batchViews(rows), total, input);
  }

  /** @throws NotFoundException when there is no such batch. */
  async getBatch(id: string): Promise<BatchView> {
    const row = await this.prisma.prepaidBatch.findUnique({
      where: { id },
      include: BATCH_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Batch not found');
    }
    return (await this.batchViews([row]))[0] as BatchView;
  }

  async updateBatch(id: string, input: UpdateBatchInput): Promise<BatchView> {
    await this.getBatch(id);
    await this.prisma.prepaidBatch.update({
      where: { id },
      data: {
        name: input.name,
        note: input.note === undefined ? undefined : input.note || null,
        expiresAt:
          input.expiresAt === undefined
            ? undefined
            : input.expiresAt
              ? new Date(input.expiresAt)
              : null,
      },
    });
    return this.getBatch(id);
  }

  /**
   * Withdraws a batch: its unused codes stop working. What was used stays used.
   *
   * @throws ConflictException when it was withdrawn already.
   */
  async voidBatch(id: string, now: Date = new Date()): Promise<BatchView> {
    const changed = await this.prisma.prepaidBatch.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: now },
    });
    if (changed.count === 0) {
      await this.getBatch(id);
      throw new ConflictException('This batch was withdrawn already');
    }
    return this.getBatch(id);
  }

  /**
   * Deletes a batch that nobody used a code of. One with used codes stays,
   * as the record of where subscriptions came from.
   */
  async removeBatch(id: string): Promise<{ name: string }> {
    const batch = await this.getBatch(id);
    if (batch.redeemed > 0) {
      throw new ConflictException(
        'Codes of this batch were used. Withdraw it instead: the record of them stays.',
      );
    }
    await this.prisma.prepaidBatch.delete({ where: { id } });
    return { name: batch.name };
  }

  async listCodes(batchId: string, input: ListCodesInput): Promise<Page<CodeView>> {
    const batch = await this.prisma.prepaidBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }
    const where: Prisma.PrepaidCodeWhereInput = {
      batchId,
      ...(input.state === 'redeemed'
        ? { redeemedAt: { not: null } }
        : input.state === 'withdrawn'
          ? { redeemedAt: null, voidedAt: { not: null } }
          : input.state === 'unused'
            ? { redeemedAt: null, voidedAt: null }
            : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.prepaidCode.findMany({
        where,
        // Used ones first, the last used on top. Then in the order they were made.
        orderBy: [{ redeemedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
        include: { redeemedBy: { select: { id: true, email: true, displayName: true } } },
        ...toSkipTake(input),
      }),
      this.prisma.prepaidCode.count({ where }),
    ]);
    const now = new Date();
    return toPage(
      rows.map((row) => ({
        id: row.id,
        masked: maskCode(row.ending),
        state: codeState(row, batch, now),
        redeemedAt: row.redeemedAt,
        redeemedBy: row.redeemedBy,
      })),
      total,
      input,
    );
  }

  /** One code in full, for an admin who hands it to somebody. */
  async reveal(codeId: string): Promise<{ code: string; batchId: string }> {
    const row = await this.prisma.prepaidCode.findUnique({ where: { id: codeId } });
    if (!row) {
      throw new NotFoundException('Code not found');
    }
    return { code: formatCode(this.secrets.decrypt(row.codeBox)), batchId: row.batchId };
  }

  /** Withdraws one code that was not used. */
  async voidCode(
    codeId: string,
    now: Date = new Date(),
  ): Promise<{ batchId: string; ending: string }> {
    const row = await this.prisma.prepaidCode.findUnique({ where: { id: codeId } });
    if (!row) {
      throw new NotFoundException('Code not found');
    }
    if (row.redeemedAt) {
      throw new ConflictException('This code was used. End the subscription instead.');
    }
    await this.prisma.prepaidCode.update({ where: { id: codeId }, data: { voidedAt: now } });
    return { batchId: row.batchId, ending: row.ending };
  }

  /**
   * Finds a code a viewer reads out, and says where it stands.
   *
   * @throws NotFoundException when no such code was ever made here.
   */
  async lookup(raw: string): Promise<CodeLookup> {
    const row = isCodeShaped(raw)
      ? await this.prisma.prepaidCode.findUnique({
          where: { codeHash: hashCode(raw) },
          include: {
            batch: { include: BATCH_INCLUDE },
            redeemedBy: { select: { id: true, email: true, displayName: true } },
          },
        })
      : null;
    if (!row) {
      throw new NotFoundException('No such code was made here. Check it for a typing mistake.');
    }
    return {
      id: row.id,
      code: formatCode(raw),
      masked: maskCode(row.ending),
      state: codeState(row, row.batch, new Date()),
      redeemedAt: row.redeemedAt,
      redeemedBy: row.redeemedBy,
      batch: {
        id: row.batch.id,
        name: row.batch.name,
        plan: row.batch.plan.name,
        days: row.batch.days,
        expiresAt: row.batch.expiresAt,
      },
    };
  }

  /**
   * The codes of a batch as a file for a spreadsheet or a printer: only the
   * ones that can still be used, unless all are asked for.
   */
  async exportCsv(
    batchId: string,
    all: boolean,
  ): Promise<{ name: string; csv: string; codes: number }> {
    const batch = await this.prisma.prepaidBatch.findUnique({
      where: { id: batchId },
      include: BATCH_INCLUDE,
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }
    const rows = await this.prisma.prepaidCode.findMany({
      where: { batchId, ...(all ? {} : { redeemedAt: null, voidedAt: null }) },
      orderBy: { id: 'asc' },
    });
    const now = new Date();
    const lines = [
      csvLine(['code', 'plan', 'days', 'valid_until', 'state', 'used_at']),
      ...rows.map((row) =>
        csvLine([
          formatCode(this.secrets.decrypt(row.codeBox)),
          batch.plan.name,
          batch.days,
          batch.expiresAt ? batch.expiresAt.toISOString().slice(0, 10) : '',
          codeState(row, batch, now),
          row.redeemedAt ? row.redeemedAt.toISOString() : '',
        ]),
      ),
    ];
    return { name: batch.name, csv: `${lines.join('\r\n')}\r\n`, codes: rows.length };
  }

  // --- Inside ----------------------------------------------------------------------

  /** A code that exists and can be used right now, with what it gives. */
  private async usable(raw: string, now: Date) {
    const row = isCodeShaped(raw)
      ? await this.prisma.prepaidCode.findUnique({
          where: { codeHash: hashCode(raw) },
          include: { batch: { include: BATCH_INCLUDE } },
        })
      : null;
    if (!row) {
      throw refuse('not_found', 'This code is not known. Check it for a typing mistake.');
    }
    const state = codeState(row, row.batch, now);
    if (state === 'redeemed') {
      throw refuse('used', 'This code was used already.');
    }
    if (state === 'expired') {
      throw refuse('expired', 'This code can no longer be used: its time ran out.');
    }
    if (state === 'withdrawn') {
      throw refuse('withdrawn', 'This code was withdrawn and cannot be used.');
    }
    return {
      id: row.id,
      ending: row.ending,
      planId: row.batch.planId,
      planName: row.batch.plan.name,
      days: row.batch.days,
      batchName: row.batch.name,
    };
  }

  private async running(
    client: Pick<PrismaClient, 'subscription'> | Prisma.TransactionClient,
    viewerId: string,
    now: Date,
  ) {
    const row = await client.subscription.findFirst({
      where: { viewerId, ...runningAt(now) },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true } } },
    });
    return row
      ? {
          id: row.id,
          planId: row.planId,
          planName: row.plan.name,
          source: row.source,
          endsAt: row.endsAt,
        }
      : null;
  }

  private async batchViews(rows: BatchRecord[]): Promise<BatchView[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const counted = await this.prisma.$queryRaw<
      { batchId: string; total: number; redeemed: number; withdrawn: number; last: Date | null }[]
    >`
      SELECT "batchId",
             COUNT(*)::int AS total,
             (COUNT(*) FILTER (WHERE "redeemedAt" IS NOT NULL))::int AS redeemed,
             (COUNT(*) FILTER (WHERE "redeemedAt" IS NULL AND "voidedAt" IS NOT NULL))::int AS withdrawn,
             MAX("redeemedAt") AS last
      FROM prepaid_codes
      WHERE "batchId" = ANY(${ids}::uuid[])
      GROUP BY 1`;
    const byId = new Map(counted.map((row) => [row.batchId, row]));
    const now = Date.now();
    return rows.map((row) => {
      const counts = byId.get(row.id);
      const state = row.voidedAt
        ? ('withdrawn' as const)
        : row.expiresAt && row.expiresAt.getTime() <= now
          ? ('expired' as const)
          : ('open' as const);
      const unused = (counts?.total ?? 0) - (counts?.redeemed ?? 0) - (counts?.withdrawn ?? 0);
      return {
        id: row.id,
        name: row.name,
        plan: row.plan,
        days: row.days,
        expiresAt: row.expiresAt,
        voidedAt: row.voidedAt,
        note: row.note,
        createdAt: row.createdAt,
        state,
        total: counts?.total ?? 0,
        redeemed: counts?.redeemed ?? 0,
        withdrawn:
          state === 'withdrawn' ? unused + (counts?.withdrawn ?? 0) : (counts?.withdrawn ?? 0),
        left: state === 'open' ? unused : 0,
        lastRedeemedAt: counts?.last ?? null,
      };
    });
  }
}
