// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PrismaClient,
  type Purchase,
  type PurchaseKind,
  type PurchaseStatus,
  type SubscriptionSource,
} from '@onyx/database';
import { type PublicImage, toPublicImage } from '../catalog/public-catalog.views.js';
import { AppConfig } from '../config/app-config.js';
import {
  isValid,
  type OwnedTitle,
  rentalDeadline,
  rentalEnd,
  strongest,
  toOwnedTitles,
  validAt,
} from './purchase-rules.js';

export type { OwnedTitle };
import type { GrantPurchaseInput } from './purchases.schemas.js';

/** A rented or bought title in the viewer's own list. */
export interface ViewerPurchaseView extends OwnedTitle {
  id: string;
  title: { slug: string; name: string; type: string; poster: PublicImage | null };
  purchasedAt: Date;
  /** Whether it can be watched right now. */
  valid: boolean;
}

/** A purchase as admins see it. */
export interface PurchaseAdminView {
  id: string;
  title: { id: string; name: string; slug: string };
  kind: PurchaseKind;
  status: PurchaseStatus;
  source: SubscriptionSource;
  /** Whether it can be watched right now. */
  valid: boolean;
  purchasedAt: Date;
  startedAt: Date | null;
  expiresAt: Date | null;
  /** What was paid, when money was paid. */
  amount: number | null;
  currency: string | null;
  note: string | null;
  grantedBy: { id: string; displayName: string } | null;
}

const FOR_ADMIN = {
  title: { select: { id: true, name: true, slug: true } },
  payment: { select: { amount: true, currency: true } },
  grantedBy: { select: { id: true, displayName: true } },
} as const;

type ForAdmin = Purchase & {
  title: { id: string; name: string; slug: string };
  payment: { amount: number; currency: string } | null;
  grantedBy: { id: string; displayName: string } | null;
};

function toAdminView(purchase: ForAdmin, now: Date = new Date()): PurchaseAdminView {
  return {
    id: purchase.id,
    title: purchase.title,
    kind: purchase.kind,
    status: purchase.status,
    source: purchase.source,
    valid: isValid(purchase, now),
    purchasedAt: purchase.createdAt,
    startedAt: purchase.startedAt,
    expiresAt: purchase.expiresAt,
    amount: purchase.payment?.amount ?? null,
    currency: purchase.payment?.currency ?? null,
    note: purchase.note,
    grantedBy: purchase.grantedBy,
  };
}

/** How many titles a session names. A viewer with more still plays them: the API decides. */
const SESSION_LIMIT = 500;

/**
 * Titles a viewer rented or bought. Such a title may be watched whatever
 * plan the viewer has or has not.
 */
@Injectable()
export class PurchasesService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  /** The viewer's right to a title that can be used now, the strongest of them. */
  async validFor(
    viewerId: string,
    titleId: string,
    now: Date = new Date(),
  ): Promise<Purchase | null> {
    const purchases = await this.prisma.purchase.findMany({
      where: { viewerId, titleId, ...validAt(now) },
    });
    return strongest(purchases);
  }

  /**
   * Notes that a rental is being watched, which starts the hours to finish it.
   * Does nothing for a bought title or a rental that was started before.
   */
  async markStarted(purchase: Purchase, now: Date = new Date()): Promise<void> {
    if (purchase.kind !== 'RENT' || purchase.startedAt !== null) {
      return;
    }
    // Only where it is still unstarted, so two players at once start it once.
    await this.prisma.purchase.updateMany({
      where: { id: purchase.id, startedAt: null },
      data: {
        startedAt: now,
        expiresAt: rentalEnd(now, purchase.expiresAt, this.config.rental.watchHours),
      },
    });
  }

  /** What the viewer can watch through renting or buying right now, for the session. */
  async ownedBy(viewerId: string, now: Date = new Date()): Promise<OwnedTitle[]> {
    const purchases = await this.prisma.purchase.findMany({
      where: { viewerId, ...validAt(now) },
      orderBy: { createdAt: 'desc' },
      take: SESSION_LIMIT,
    });
    return toOwnedTitles(purchases);
  }

  /** The viewer's own rented and bought titles, newest first, with those that ran out. */
  async listOwn(viewerId: string, now: Date = new Date()): Promise<ViewerPurchaseView[]> {
    const purchases = await this.prisma.purchase.findMany({
      where: { viewerId, status: 'ACTIVE', title: { status: 'PUBLISHED' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { title: { select: { slug: true, name: true, type: true, poster: true } } },
    });
    return purchases.map((purchase) => ({
      id: purchase.id,
      titleId: purchase.titleId,
      kind: purchase.kind,
      expiresAt: purchase.expiresAt,
      started: purchase.startedAt !== null,
      title: {
        slug: purchase.title.slug,
        name: purchase.title.name,
        type: purchase.title.type,
        poster: toPublicImage(purchase.title.poster, this.config.mediaBaseUrl),
      },
      purchasedAt: purchase.createdAt,
      valid: isValid(purchase, now),
    }));
  }

  /** @throws NotFoundException when there is no such viewer. */
  async forViewer(viewerId: string): Promise<PurchaseAdminView[]> {
    await this.assertViewer(viewerId);
    const purchases = await this.prisma.purchase.findMany({
      where: { viewerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      include: FOR_ADMIN,
    });
    const now = new Date();
    return purchases.map((purchase) => toAdminView(purchase, now));
  }

  /**
   * Gives a viewer a title by hand: paid in cash, or as a gift.
   *
   * @throws NotFoundException when the viewer or the title does not exist.
   * @throws ConflictException when the viewer owns the title already.
   */
  async grant(
    viewerId: string,
    input: GrantPurchaseInput,
    adminId: string | null,
  ): Promise<PurchaseAdminView> {
    const viewer = await this.assertViewer(viewerId);
    const title = await this.prisma.title.findUnique({
      where: { id: input.titleId },
      select: { id: true, name: true },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    await this.assertNotOwned(viewerId, title.id, input.kind);

    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const payment =
        input.amount !== null
          ? await tx.payment.create({
              data: {
                viewerId,
                viewerEmail: viewer.email,
                kind: input.kind === 'RENT' ? 'RENTAL' : 'PURCHASE',
                titleId: title.id,
                titleName: title.name,
                source: 'MANUAL',
                amount: input.amount,
                currency: this.config.billingCurrency,
                paidAt: now,
                note: input.note,
                recordedById: adminId,
              },
            })
          : null;
      return tx.purchase.create({
        data: {
          viewerId,
          titleId: title.id,
          kind: input.kind,
          source: 'MANUAL',
          expiresAt:
            input.kind === 'RENT' ? rentalDeadline(now, this.config.rental.startDays) : null,
          paymentId: payment?.id ?? null,
          note: input.note,
          grantedById: adminId,
        },
        include: FOR_ADMIN,
      });
    });
    return toAdminView(created, now);
  }

  /**
   * Takes a title back from a viewer, at once. Money is not returned by this.
   *
   * @throws NotFoundException
   * @throws ConflictException when it was taken back before.
   */
  async revoke(id: string): Promise<PurchaseAdminView> {
    const purchase = await this.prisma.purchase.findUnique({ where: { id } });
    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }
    if (purchase.status !== 'ACTIVE') {
      throw new ConflictException('This was taken back already.');
    }
    const updated = await this.prisma.purchase.update({
      where: { id },
      data: { status: 'REVOKED' },
      include: FOR_ADMIN,
    });
    return toAdminView(updated);
  }

  /**
   * Refuses to sell a viewer what they have: a bought title in any way, and a
   * running rental as another rental.
   *
   * @throws ConflictException
   */
  async assertNotOwned(viewerId: string, titleId: string, kind: PurchaseKind): Promise<void> {
    const owned = await this.validFor(viewerId, titleId);
    if (owned?.kind === 'BUY') {
      throw alreadyOwned('This title is bought already.');
    }
    if (owned && kind === 'RENT') {
      throw alreadyOwned('This title is rented already, and the rental has not run out.');
    }
  }

  private async assertViewer(viewerId: string) {
    const viewer = await this.prisma.viewer.findUnique({
      where: { id: viewerId },
      select: { id: true, email: true },
    });
    if (!viewer) {
      throw new NotFoundException('Viewer not found');
    }
    return viewer;
  }
}

function alreadyOwned(message: string): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'already_owned',
    message,
  });
}
