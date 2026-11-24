// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type CampaignAudience, type Prisma, PrismaClient } from '@onyx/database';
import { runningAt } from '../billing/entitlement.js';
import { toImageView } from '../catalog/catalog.views.js';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { AppConfig } from '../config/app-config.js';
import { NotificationsService } from './notifications.service.js';
import type {
  CreateCampaignInput,
  ListCampaignsInput,
  UpdateCampaignInput,
} from './push.schemas.js';

/** Viewers a message is made for in one go. */
const BATCH = 2000;

const CAMPAIGN_INCLUDE = {
  linked: { select: { id: true, slug: true, name: true, type: true, status: true } },
  plan: { select: { id: true, name: true } },
} satisfies Prisma.PushCampaignInclude;
type CampaignRecord = Prisma.PushCampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>;

export interface CampaignView {
  id: string;
  title: string;
  body: string;
  linked: { id: string; slug: string; name: string; type: string; status: string } | null;
  link: string | null;
  audience: CampaignAudience;
  plan: { id: string; name: string } | null;
  status: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Viewers it was made for. */
  recipients: number;
  /** Of those: on how many accounts a device took it, how many saw it in their list, and how many opened it. */
  pushed: number;
  read: number;
  opened: number;
  /** Notifications that still wait to be sent to devices. */
  waiting: number;
}

/** Who an audience is, as a filter on viewers. Only accounts that are not disabled, and that want announcements. */
export function audienceWhere(
  audience: CampaignAudience,
  planId: string | null,
  now: Date = new Date(),
): Prisma.ViewerWhereInput {
  const base: Prisma.ViewerWhereInput = {
    status: 'ACTIVE',
    NOT: { mutedTopics: { has: 'ANNOUNCEMENTS' } },
  };
  switch (audience) {
    case 'SUBSCRIBERS':
      return { ...base, subscriptions: { some: runningAt(now) } };
    case 'NOT_SUBSCRIBED':
      return { ...base, subscriptions: { none: runningAt(now) } };
    case 'PLAN':
      return {
        ...base,
        subscriptions: { some: { ...runningAt(now), planId: planId ?? undefined } },
      };
    default:
      return base;
  }
}

/**
 * Messages the operator writes for many viewers: written, kept as a draft,
 * sent at once or at a set time, and counted afterwards.
 */
@Injectable()
export class CampaignsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async list(input: ListCampaignsInput): Promise<Page<CampaignView>> {
    const where: Prisma.PushCampaignWhereInput = { status: input.status };
    const [rows, total] = await Promise.all([
      this.prisma.pushCampaign.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: CAMPAIGN_INCLUDE,
        ...toSkipTake(input),
      }),
      this.prisma.pushCampaign.count({ where }),
    ]);
    return toPage(await this.views(rows), total, input);
  }

  /** @throws NotFoundException when there is no such message. */
  async get(id: string): Promise<CampaignView> {
    const row = await this.prisma.pushCampaign.findUnique({
      where: { id },
      include: CAMPAIGN_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Message not found');
    }
    return (await this.views([row]))[0] as CampaignView;
  }

  async create(input: CreateCampaignInput, adminId: string | null): Promise<CampaignView> {
    await this.assertTargets(input.titleId ?? null, input.planId ?? null);
    const created = await this.prisma.pushCampaign.create({
      data: {
        title: input.title,
        body: input.body,
        titleId: input.titleId ?? null,
        link: input.link ?? null,
        audience: input.audience,
        planId: input.audience === 'PLAN' ? (input.planId ?? null) : null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        createdById: adminId,
      },
      select: { id: true },
    });
    return this.get(created.id);
  }

  /** @throws ConflictException when the message was sent already, or is being sent. */
  async update(id: string, input: UpdateCampaignInput): Promise<CampaignView> {
    const current = await this.editable(id);
    const next = {
      titleId: input.titleId === undefined ? current.titleId : input.titleId,
      link: input.link === undefined ? current.link : input.link,
      audience: input.audience ?? current.audience,
      planId: input.planId === undefined ? current.planId : input.planId,
    };
    if (next.titleId && next.link) {
      // Choosing the one lets go of the other.
      if (input.titleId) {
        next.link = null;
      } else {
        next.titleId = null;
      }
    }
    if (next.audience === 'PLAN' && !next.planId) {
      throw new BadRequestException('Choose the plan');
    }
    await this.assertTargets(next.titleId, next.audience === 'PLAN' ? next.planId : null);
    await this.prisma.pushCampaign.update({
      where: { id },
      data: {
        title: input.title,
        body: input.body,
        ...next,
        planId: next.audience === 'PLAN' ? next.planId : null,
        scheduledAt:
          input.scheduledAt === undefined
            ? undefined
            : input.scheduledAt
              ? new Date(input.scheduledAt)
              : null,
      },
    });
    return this.get(id);
  }

  /** Deletes a message. What viewers got of it stays in their lists. */
  async remove(id: string): Promise<{ title: string }> {
    const row = await this.prisma.pushCampaign.findUnique({
      where: { id },
      select: { title: true, status: true },
    });
    if (!row) {
      throw new NotFoundException('Message not found');
    }
    if (row.status === 'SENDING') {
      throw new ConflictException('The message is being sent. Wait a moment.');
    }
    await this.prisma.pushCampaign.delete({ where: { id } });
    return { title: row.title };
  }

  /**
   * Sends a message: at once, or at its time when it has one in the future.
   * The sending itself is done by the runner, moments later.
   *
   * @throws ConflictException when it was sent already.
   */
  async send(id: string, now: Date = new Date()): Promise<CampaignView> {
    const current = await this.editable(id);
    const later = current.scheduledAt !== null && current.scheduledAt.getTime() > now.getTime();
    await this.prisma.pushCampaign.update({
      where: { id },
      data: later
        ? { status: 'SCHEDULED' }
        : { status: 'SENDING', scheduledAt: current.scheduledAt ?? now },
    });
    return this.get(id);
  }

  /** Takes a message that waits for its time back to a draft. */
  async cancel(id: string): Promise<CampaignView> {
    const changed = await this.prisma.pushCampaign.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: { status: 'DRAFT' },
    });
    if (changed.count === 0) {
      await this.get(id);
      throw new ConflictException('Only a message that waits for its time can be held back');
    }
    return this.get(id);
  }

  /** How many viewers an audience is right now, and how many of them have a device that takes notifications. */
  async reach(
    audience: CampaignAudience,
    planId: string | null,
  ): Promise<{ viewers: number; withDevice: number }> {
    const where = audienceWhere(audience, planId);
    const [viewers, withDevice] = await Promise.all([
      this.prisma.viewer.count({ where }),
      this.prisma.viewer.count({ where: { ...where, pushDevices: { some: {} } } }),
    ]);
    return { viewers, withDevice };
  }

  /**
   * Sends a message to one viewer, to see how it arrives. It is not counted
   * for the message, and goes whatever kinds the viewer turned off: an admin
   * tries it on their own account.
   *
   * @throws NotFoundException when no viewer has this address.
   */
  async test(id: string, email: string): Promise<{ devices: number }> {
    const campaign = await this.record(id);
    const viewer = await this.prisma.viewer.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      select: { id: true, _count: { select: { pushDevices: true } } },
    });
    if (!viewer) {
      throw new NotFoundException('No viewer has this email address');
    }
    await this.notifications.create([viewer.id], {
      ...(await this.content(campaign)),
      campaignId: null,
      title: `[Test] ${campaign.title}`.slice(0, 120),
    });
    return { devices: viewer._count.pushDevices };
  }

  /**
   * Makes the notifications of the messages whose time has come. For the
   * runner. A message that was started and not finished, because the
   * process stopped, is finished here: no viewer gets it twice.
   *
   * @returns How many messages were sent.
   */
  async sendDue(now: Date = new Date()): Promise<number> {
    await this.prisma.pushCampaign.updateMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      data: { status: 'SENDING' },
    });
    const due = await this.prisma.pushCampaign.findMany({
      where: { status: 'SENDING' },
      orderBy: { scheduledAt: 'asc' },
      include: CAMPAIGN_INCLUDE,
      take: 5,
    });
    for (const campaign of due) {
      const content = await this.content(campaign);
      const where = audienceWhere(campaign.audience, campaign.planId, now);
      let after: string | undefined;
      for (;;) {
        const viewers = await this.prisma.viewer.findMany({
          where: { ...where, ...(after ? { id: { gt: after } } : {}) },
          orderBy: { id: 'asc' },
          take: BATCH,
          select: { id: true },
        });
        if (viewers.length === 0) {
          break;
        }
        await this.notifications.create(
          viewers.map((viewer) => viewer.id),
          { ...content, campaignId: campaign.id, dedupeKey: `campaign:${campaign.id}` },
        );
        after = viewers[viewers.length - 1]?.id;
      }
      await this.prisma.pushCampaign.update({
        where: { id: campaign.id },
        data: {
          status: 'SENT',
          sentAt: now,
          recipients: await this.prisma.notification.count({ where: { campaignId: campaign.id } }),
        },
      });
    }
    return due.length;
  }

  /** What viewers get of a message: its words, and where it leads. */
  private async content(campaign: CampaignRecord) {
    const title = campaign.titleId
      ? await this.prisma.title.findUnique({
          where: { id: campaign.titleId },
          select: { slug: true, backdrop: true, poster: true },
        })
      : null;
    const image = title?.backdrop ?? title?.poster ?? null;
    return {
      topic: 'ANNOUNCEMENTS' as const,
      title: campaign.title,
      body: campaign.body,
      imageUrl: image ? toImageView(image, '').url : null,
      link: title ? `/title/${title.slug}` : campaign.link,
      data: (title
        ? { type: 'title', slug: title.slug }
        : campaign.link
          ? { type: 'link', path: campaign.link }
          : {}) as Record<string, string>,
    };
  }

  private async record(id: string): Promise<CampaignRecord> {
    const row = await this.prisma.pushCampaign.findUnique({
      where: { id },
      include: CAMPAIGN_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Message not found');
    }
    return row;
  }

  private async editable(id: string): Promise<CampaignRecord> {
    const row = await this.record(id);
    if (row.status !== 'DRAFT' && row.status !== 'SCHEDULED') {
      throw new ConflictException(
        row.status === 'SENDING'
          ? 'The message is being sent'
          : 'The message was sent already. Write a new one.',
      );
    }
    return row;
  }

  private async assertTargets(titleId: string | null, planId: string | null): Promise<void> {
    if (titleId && !(await this.prisma.title.count({ where: { id: titleId } }))) {
      throw new BadRequestException('The title does not exist');
    }
    if (planId && !(await this.prisma.plan.count({ where: { id: planId } }))) {
      throw new BadRequestException('The plan does not exist');
    }
  }

  private async views(rows: CampaignRecord[]): Promise<CampaignView[]> {
    const ids = rows.filter((row) => row.status === 'SENT').map((row) => row.id);
    const counted = ids.length
      ? await this.prisma.$queryRaw<
          { campaignId: string; pushed: number; read: number; opened: number; waiting: number }[]
        >`
          SELECT "campaignId",
                 (COUNT(*) FILTER (WHERE "pushState" = 'SENT'))::int AS pushed,
                 (COUNT(*) FILTER (WHERE "readAt" IS NOT NULL))::int AS read,
                 (COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL))::int AS opened,
                 (COUNT(*) FILTER (WHERE "pushState" = 'PENDING'))::int AS waiting
          FROM notifications
          WHERE "campaignId" = ANY(${ids}::uuid[])
          GROUP BY 1`
      : [];
    const byId = new Map(counted.map((row) => [row.campaignId, row]));
    return rows.map((row) => {
      const counts = byId.get(row.id);
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        linked: row.linked,
        link: row.link,
        audience: row.audience,
        plan: row.plan,
        status: row.status,
        scheduledAt: row.scheduledAt,
        sentAt: row.sentAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        recipients: row.recipients,
        pushed: counts?.pushed ?? 0,
        read: counts?.read ?? 0,
        opened: counts?.opened ?? 0,
        waiting: counts?.waiting ?? 0,
      };
    });
  }
}
