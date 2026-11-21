// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, type Viewer } from '@onyx/database';
import { hashPassword } from '../auth/password-hasher.js';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import type { CreateViewerInput, ListViewersInput, UpdateViewerInput } from './viewer.schemas.js';
import { toViewerAdminView, type ViewerAdminDetail, type ViewerAdminView } from './viewer.view.js';
import { ACTIVE_SESSION, ViewerSessionService } from './viewer-session.service.js';

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
@Injectable()
export class ViewersAdminService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(ViewerSessionService) private readonly sessions: ViewerSessionService,
  ) {}

  async list(input: ListViewersInput): Promise<Page<ViewerAdminView>> {
    const where: Prisma.ViewerWhereInput = {
      status: input.status,
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
        include: { _count: { select: { sessions: { where: ACTIVE_SESSION() } } } },
        ...toSkipTake(input),
      }),
      this.prisma.viewer.count({ where }),
    ]);
    return toPage(
      viewers.map((viewer) => toViewerAdminView(viewer, viewer._count.sessions)),
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
    const sessions = await this.sessions.listActive(id);
    return {
      ...toViewerAdminView(viewer, sessions.length),
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
        },
      });
      return toViewerAdminView(viewer, 0);
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
    const changed = (Object.keys(input) as (keyof UpdateViewerInput)[]).filter(
      (key) => input[key] !== undefined && input[key] !== before[key],
    );

    let viewer = before;
    if (changed.length > 0) {
      try {
        viewer = await this.prisma.viewer.update({ where: { id }, data: input });
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
    return { viewer: toViewerAdminView(viewer, active), changed, sessionsEnded };
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
    await this.prisma.viewer.delete({ where: { id } });
    return viewer;
  }

  private async find(id: string): Promise<Viewer> {
    const viewer = await this.prisma.viewer.findUnique({ where: { id } });
    if (!viewer) {
      throw new NotFoundException('Viewer not found');
    }
    return viewer;
  }
}
