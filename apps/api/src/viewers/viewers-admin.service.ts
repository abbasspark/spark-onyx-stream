// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, type Viewer } from '@onyx/database';
import { hashPassword } from '../auth/password-hasher.js';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import type { CreateViewerInput, ListViewersInput, UpdateViewerInput } from './viewer.schemas.js';
import { runningAt } from '../billing/entitlement.js';
import {
  toViewerAdminView,
  type ViewerAdminDetail,
  type ViewerAdminView,
  type ViewerPlanRef,
} from './viewer.view.js';
import { toProfileView, ViewerProfilesService } from './viewer-profiles.service.js';
import { ACTIVE_SESSION, ViewerSessionService } from './viewer-session.service.js';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service.js';

/** What changing a viewer did, for the audit log. */
export interface ViewerChange {
  viewer: ViewerAdminView;
  /** Names of the fields that changed. */
  changed: string[];
  sessionsEnded: number;
}

const EMAIL_TAKEN = 'Another viewer already uses this email address';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Management of viewers by admins. */
/** The newest running subscription, with the name of its plan. */
const RUNNING_PLAN = {
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: { endsAt: true, plan: { select: { id: true, name: true } } },
} as const;

function toPlanRef(
  subscription: { endsAt: Date | null; plan: { id: string; name: string } } | undefined,
): ViewerPlanRef | null {
  return subscription
    ? { id: subscription.plan.id, name: subscription.plan.name, endsAt: subscription.endsAt }
    : null;
}

@Injectable()
export class ViewersAdminService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(WebhookDeliveryService) private readonly webhooks: WebhookDeliveryService,
    @Inject(ViewerSessionService) private readonly sessions: ViewerSessionService,
    @Inject(ViewerProfilesService) private readonly profiles: ViewerProfilesService,
  ) {}

  async list(input: ListViewersInput): Promise<Page<ViewerAdminView>> {
    const running = runningAt();
    const where: Prisma.ViewerWhereInput = {
      status: input.status,
      ...(input.subscribed === 'yes' ? { subscriptions: { some: running } } : {}),
      ...(input.subscribed === 'no' ? { subscriptions: { none: running } } : {}),
      ...(input.q
        ? {
            OR: [
              { email: { contains: input.q, mode: 'insensitive' } },
              { displayName: { contains: input.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    // Viewers who never signed in come last in either direction.
    const orderBy: Prisma.ViewerOrderByWithRelationInput[] =
      input.sort === 'lastLoginAt'
        ? [{ lastLoginAt: { sort: input.order, nulls: 'last' } }, { id: 'desc' }]
        : [{ [input.sort]: input.order }, { id: 'desc' }];

    const [viewers, total] = await Promise.all([
      this.prisma.viewer.findMany({
        where,
        orderBy,
        include: {
          _count: { select: { sessions: { where: ACTIVE_SESSION() } } },
          subscriptions: { where: running, ...RUNNING_PLAN },
        },
        ...toSkipTake(input),
      }),
      this.prisma.viewer.count({ where }),
    ]);
    return toPage(
      viewers.map((viewer) =>
        toViewerAdminView(viewer, viewer._count.sessions, toPlanRef(viewer.subscriptions[0])),
      ),
      total,
      input,
    );
  }

  /** @throws NotFoundException */
  async get(id: string): Promise<ViewerAdminDetail> {
    const viewer = await this.prisma.viewer.findUnique({ where: { id } });
    if (!viewer) {
      throw new NotFoundException('Viewer not found');
    }
    const [sessions, profiles] = await Promise.all([
      this.sessions.listActive(id),
      this.profiles.list(viewer),
    ]);
    return {
      ...toViewerAdminView(viewer, sessions.length, await this.planOf(id)),
      profiles: profiles.map(toProfileView),
      sessions: sessions.map((session) => ({
        id: session.id,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
      })),
    };
  }

  /** @throws ConflictException when the email address is taken. */
  async create(input: CreateViewerInput): Promise<ViewerAdminView> {
    try {
      const viewer = await this.prisma.viewer.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash: await hashPassword(input.password),
          emailVerifiedAt: input.emailVerified ? new Date() : null,
        },
      });
      await this.webhooks.emit('viewer.created', {
        viewer: { id: viewer.id, email: viewer.email, displayName: viewer.displayName },
        by: 'admin',
      });
      return toViewerAdminView(viewer, 0, null);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(EMAIL_TAKEN);
      }
      throw error;
    }
  }

  /** Changes a viewer. Disabling one signs them out everywhere. */
  async update(id: string, input: UpdateViewerInput): Promise<ViewerChange> {
    const before = await this.find(id);
    const { emailVerified, ...fields } = input;
    const changed: string[] = (Object.keys(fields) as (keyof typeof fields)[]).filter(
      (key) => fields[key] !== undefined && fields[key] !== before[key],
    );

    // A new address is not confirmed, unless the admin vouches for it in the same step.
    const wasVerified = before.emailVerifiedAt !== null;
    const isVerified = emailVerified ?? (changed.includes('email') ? false : wasVerified);
    if (isVerified !== wasVerified) {
      changed.push('emailVerified');
    }

    let viewer = before;
    if (changed.length > 0) {
      try {
        viewer = await this.prisma.viewer.update({
          where: { id },
          data: {
            ...fields,
            ...(isVerified !== wasVerified
              ? { emailVerifiedAt: isVerified ? new Date() : null }
              : {}),
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(EMAIL_TAKEN);
        }
        throw error;
      }
    }

    const disabled = before.status === 'ACTIVE' && viewer.status === 'DISABLED';
    const sessionsEnded = disabled ? await this.sessions.revokeAll(id) : 0;
    const active = disabled ? 0 : (await this.sessions.listActive(id)).length;
    return {
      viewer: toViewerAdminView(viewer, active, await this.planOf(id)),
      changed,
      sessionsEnded,
    };
  }

  /**
   * Sets a new password and signs the viewer out everywhere.
   *
   * @returns The number of sessions ended.
   */
  async resetPassword(id: string, newPassword: string): Promise<number> {
    await this.find(id);
    await this.prisma.viewer.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return this.sessions.revokeAll(id);
  }

  /** @returns The number of sessions ended. */
  async signOutEverywhere(id: string): Promise<number> {
    await this.find(id);
    return this.sessions.revokeAll(id);
  }

  /** Deletes a viewer with everything stored about them. */
  async remove(id: string): Promise<Viewer> {
    const viewer = await this.find(id);
    const paying = await this.prisma.subscription.findFirst({
      where: { viewerId: id, source: 'STRIPE', ...runningAt() },
      select: { id: true },
    });
    if (paying) {
      // Deleting the account would not stop the payments at Stripe.
      throw new ConflictException(
        'This viewer pays for a subscription online. End the subscription first, then delete the account.',
      );
    }
    await this.prisma.viewer.delete({ where: { id } });
    return viewer;
  }

  /** The plan a viewer watches through right now. */
  private async planOf(viewerId: string): Promise<ViewerPlanRef | null> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { viewerId, ...runningAt() },
      ...RUNNING_PLAN,
    });
    return toPlanRef(subscription ?? undefined);
  }

  /** @throws NotFoundException */
  async find(id: string): Promise<Viewer> {
    const viewer = await this.prisma.viewer.findUnique({ where: { id } });
    if (!viewer) {
      throw new NotFoundException('Viewer not found');
    }
    return viewer;
  }
}
