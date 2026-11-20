// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { type AdminView, toAdminView } from '../admins/admin.view.js';
import { AuditService } from '../audit/audit.service.js';
import type { ChangePasswordInput, LoginInput, SetupInput } from './auth.schemas.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { hashPassword, needsRehash, verifyPassword } from './password-hasher.js';
import type { AdminPrincipal } from './principal.js';
import type { RequestInfo } from './request-info.js';
import { SessionService } from './session.service.js';

/** Arbitrary constant that identifies the first-run setup lock in PostgreSQL. */
const SETUP_ADVISORY_LOCK_ID = 727_274_001;

/**
 * A valid hash of a random password. Verifying against it when the email is
 * unknown makes that case take as long as a wrong password, so response time
 * does not reveal which email addresses exist.
 */
const DUMMY_HASH_PROMISE = hashPassword(`dummy-${Math.random()}-${Date.now()}`);

export interface LoginResult {
  token: string;
  expiresAt: Date;
  admin: AdminView;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(LoginThrottleService) private readonly throttle: LoginThrottleService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** True while no admin exists and the first owner still has to be created. */
  async isSetupRequired(): Promise<boolean> {
    return (await this.prisma.adminUser.count()) === 0;
  }

  /**
   * Creates the first admin as owner. Works only while no admin exists.
   * A database lock makes sure two simultaneous requests cannot both succeed.
   */
  async setup(input: SetupInput, info: RequestInfo): Promise<AdminView> {
    const passwordHash = await hashPassword(input.password);

    const admin = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_ADVISORY_LOCK_ID})`;

      if ((await tx.adminUser.count()) > 0) {
        throw new ConflictException('Setup is already complete');
      }

      return tx.adminUser.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          role: 'OWNER',
        },
      });
    });

    await this.audit.record({
      action: 'auth.setup',
      adminId: admin.id,
      entityType: 'AdminUser',
      entityId: admin.id,
      ipAddress: info.ipAddress,
    });

    return toAdminView(admin);
  }

  async login(input: LoginInput, info: RequestInfo): Promise<LoginResult> {
    const retryAfter = await this.throttle.retryAfterSeconds(input.email, info.ipAddress);
    if (retryAfter > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Too many failed sign-in attempts. Try again later.',
          retryAfterSeconds: retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { email: input.email } });
    const passwordMatches = await verifyPassword(
      input.password,
      admin?.passwordHash ?? (await DUMMY_HASH_PROMISE),
    );

    if (!admin || !passwordMatches || !admin.isActive) {
      await this.throttle.recordFailure(input.email, info.ipAddress);
      await this.audit.record({
        action: 'auth.login_failed',
        adminId: admin?.id ?? null,
        metadata: { email: input.email },
        ipAddress: info.ipAddress,
      });
      // One message for every cause, so the response does not reveal which part was wrong.
      throw new UnauthorizedException('Email or password is incorrect');
    }

    await this.throttle.reset(input.email, info.ipAddress);

    const updated = await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        lastLoginAt: new Date(),
        // Upgrade the stored hash when the hashing parameters have been raised.
        ...(needsRehash(admin.passwordHash)
          ? { passwordHash: await hashPassword(input.password) }
          : {}),
      },
    });

    const { token, session } = await this.sessions.create(admin.id, info);

    await this.audit.record({
      action: 'auth.login',
      adminId: admin.id,
      entityType: 'AdminSession',
      entityId: session.id,
      ipAddress: info.ipAddress,
    });

    return { token, expiresAt: session.expiresAt, admin: toAdminView(updated) };
  }

  async logout(principal: AdminPrincipal, info: RequestInfo): Promise<void> {
    await this.sessions.revoke(principal.sessionId);
    await this.audit.record({
      action: 'auth.logout',
      adminId: principal.adminId,
      entityType: 'AdminSession',
      entityId: principal.sessionId,
      ipAddress: info.ipAddress,
    });
  }

  /** Changes the caller's own password and signs out their other sessions. */
  async changePassword(
    principal: AdminPrincipal,
    input: ChangePasswordInput,
    info: RequestInfo,
  ): Promise<void> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: principal.adminId },
    });

    if (!(await verifyPassword(input.currentPassword, admin.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException('The new password must differ from the current one');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    const revoked = await this.sessions.revokeAllForAdmin(admin.id, principal.sessionId);

    await this.audit.record({
      action: 'auth.password_change',
      adminId: admin.id,
      entityType: 'AdminUser',
      entityId: admin.id,
      metadata: { otherSessionsRevoked: revoked },
      ipAddress: info.ipAddress,
    });
  }
}
