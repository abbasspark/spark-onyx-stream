// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AdminUser, PrismaClient } from '@onyx/database';
import { AuditService } from '../audit/audit.service.js';
import { AppConfig } from '../config/app-config.js';
import { SecretBox } from '../crypto/secret-box.js';
import { verifyPassword } from './password-hasher.js';
import type { AdminPrincipal } from './principal.js';
import type { RequestInfo } from './request-info.js';
import { SessionService } from './session.service.js';
import {
  generateRecoveryCode,
  generateTotpSecret,
  hashRecoveryCode,
  looksLikeTotp,
  otpauthUri,
  RECOVERY_CODE_COUNT,
  verifyTotp,
} from './totp.js';

/** Where an admin stands with two-factor sign-in. */
export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: Date | null;
  /** Recovery codes that were not used yet. */
  recoveryCodesLeft: number;
  /** Whether this installation asks every admin for it. */
  required: boolean;
}

/** What an authenticator app needs to make the codes. Shown once, while setting up. */
export interface TwoFactorSetup {
  /** The secret as base32, for typing it in by hand. */
  secret: string;
  /** The same as an address for a QR code. */
  uri: string;
}

/** How a second factor was given at sign-in. */
export type SecondFactor = 'totp' | 'recovery';

const wrongCode = () =>
  new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    code: 'two_factor_invalid',
    message: 'This code is not right. Codes change every 30 seconds: enter the one shown now.',
  });

/**
 * Two-factor sign-in for admins: a code from an authenticator app on top of
 * the password, with recovery codes for a phone that is lost.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(SecretBox) private readonly secrets: SecretBox,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async status(adminId: string): Promise<TwoFactorStatus> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    return {
      enabled: admin.totpEnabledAt !== null,
      enabledAt: admin.totpEnabledAt,
      recoveryCodesLeft: admin.totpEnabledAt
        ? await this.prisma.adminRecoveryCode.count({ where: { adminId, usedAt: null } })
        : 0,
      required: this.config.adminTwoFactorRequired,
    };
  }

  /**
   * Starts setting it up: makes a secret for the authenticator app. Nothing
   * changes at sign-in until a code made from it was entered.
   *
   * @throws BadRequestException when the password is wrong.
   * @throws ConflictException when two-factor sign-in is on already.
   */
  async begin(principal: AdminPrincipal, password: string): Promise<TwoFactorSetup> {
    const admin = await this.verified(principal.adminId, password);
    if (admin.totpEnabledAt) {
      throw new ConflictException('Two-factor sign-in is on already');
    }
    const secret = generateTotpSecret();
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpSecret: this.secrets.encrypt(secret), totpLastStep: null },
    });
    return { secret, uri: otpauthUri(secret, this.config.siteName, admin.email) };
  }

  /**
   * Switches it on, once a code shows that the app has the secret. Signs the
   * admin out everywhere else.
   *
   * @returns The recovery codes. They are shown this once.
   * @throws ConflictException when nothing was started, or it is on already.
   * @throws BadRequestException when the code is wrong.
   */
  async confirm(
    principal: AdminPrincipal,
    code: string,
    info: RequestInfo,
  ): Promise<{ recoveryCodes: string[] }> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: principal.adminId },
    });
    if (admin.totpEnabledAt) {
      throw new ConflictException('Two-factor sign-in is on already');
    }
    if (!admin.totpSecret) {
      throw new ConflictException('Start setting it up first');
    }
    const step = verifyTotp(this.secrets.decrypt(admin.totpSecret), code);
    if (step === null) {
      throw wrongCode();
    }
    const recoveryCodes = await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: admin.id },
        data: { totpEnabledAt: new Date(), totpLastStep: step },
      });
      return this.newRecoveryCodes(tx, admin.id);
    });
    const revoked = await this.sessions.revokeAllForAdmin(admin.id, principal.sessionId);
    await this.audit.record({
      action: 'auth.two_factor_enable',
      adminId: admin.id,
      entityType: 'AdminUser',
      entityId: admin.id,
      metadata: { otherSessionsRevoked: revoked },
      ipAddress: info.ipAddress,
    });
    return { recoveryCodes };
  }

  /**
   * Switches it off. Needs the password and a code, so that a session left
   * open on a desk is not enough.
   *
   * @throws ForbiddenException on an installation that asks every admin for it.
   * @throws BadRequestException when the password or the code is wrong.
   */
  async disable(
    principal: AdminPrincipal,
    password: string,
    code: string,
    info: RequestInfo,
  ): Promise<void> {
    if (this.config.adminTwoFactorRequired) {
      throw new ForbiddenException(
        'This installation asks every admin for two-factor sign-in, so it cannot be switched off',
      );
    }
    const admin = await this.verified(principal.adminId, password);
    if (!admin.totpEnabledAt) {
      throw new ConflictException('Two-factor sign-in is not on');
    }
    if (!(await this.check(admin, code))) {
      throw wrongCode();
    }
    await this.clear(admin.id);
    await this.audit.record({
      action: 'auth.two_factor_disable',
      adminId: admin.id,
      entityType: 'AdminUser',
      entityId: admin.id,
      ipAddress: info.ipAddress,
    });
  }

  /**
   * Makes new recovery codes. The old ones stop working.
   *
   * @throws BadRequestException when the password or the code is wrong.
   */
  async regenerate(
    principal: AdminPrincipal,
    password: string,
    code: string,
    info: RequestInfo,
  ): Promise<{ recoveryCodes: string[] }> {
    const admin = await this.verified(principal.adminId, password);
    if (!admin.totpEnabledAt) {
      throw new ConflictException('Two-factor sign-in is not on');
    }
    if (!(await this.check(admin, code))) {
      throw wrongCode();
    }
    const recoveryCodes = await this.prisma.$transaction((tx) =>
      this.newRecoveryCodes(tx, admin.id),
    );
    await this.audit.record({
      action: 'auth.recovery_codes_new',
      adminId: admin.id,
      entityType: 'AdminUser',
      entityId: admin.id,
      ipAddress: info.ipAddress,
    });
    return { recoveryCodes };
  }

  /**
   * Checks the second factor of an admin who has it on: a code from the app,
   * or a recovery code. Either counts once.
   *
   * @returns How it was given, or null when it is wrong or was used before.
   */
  async check(admin: AdminUser, code: string, now = new Date()): Promise<SecondFactor | null> {
    if (!admin.totpSecret || !admin.totpEnabledAt) {
      return null;
    }
    if (looksLikeTotp(code)) {
      const step = verifyTotp(
        this.secrets.decrypt(admin.totpSecret),
        code,
        now,
        admin.totpLastStep,
      );
      if (step === null) {
        return null;
      }
      // Only one of two requests with the same code gets through.
      const { count } = await this.prisma.adminUser.updateMany({
        where: {
          id: admin.id,
          OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
        },
        data: { totpLastStep: step },
      });
      return count === 1 ? 'totp' : null;
    }
    const { count } = await this.prisma.adminRecoveryCode.updateMany({
      where: { adminId: admin.id, codeHash: hashRecoveryCode(code), usedAt: null },
      data: { usedAt: now },
    });
    return count === 1 ? 'recovery' : null;
  }

  /** Recovery codes of an admin that were not used yet. */
  recoveryCodesLeft(adminId: string): Promise<number> {
    return this.prisma.adminRecoveryCode.count({ where: { adminId, usedAt: null } });
  }

  /**
   * Takes two-factor sign-in off another admin who lost their phone and their
   * recovery codes, and signs them out. They sign in with the password alone
   * and set it up again.
   *
   * @throws BadRequestException for one's own account: that is done with the password and a code.
   * @throws ForbiddenException when the target is an owner and the actor is not.
   * @throws NotFoundException
   */
  async resetFor(principal: AdminPrincipal, targetId: string, info: RequestInfo): Promise<void> {
    if (principal.adminId === targetId) {
      throw new BadRequestException(
        'Switch your own two-factor sign-in off under your account, with your password and a code',
      );
    }
    const target = await this.prisma.adminUser.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Admin not found');
    }
    if (target.role === 'OWNER' && principal.role !== 'OWNER') {
      throw new ForbiddenException('Only an owner can change another owner');
    }
    if (!target.totpEnabledAt && !target.totpSecret) {
      throw new ConflictException('This admin has no two-factor sign-in to take off');
    }
    await this.clear(target.id);
    const revoked = await this.sessions.revokeAllForAdmin(target.id);
    await this.audit.record({
      action: 'admin.two_factor_reset',
      adminId: principal.adminId,
      entityType: 'AdminUser',
      entityId: target.id,
      metadata: { email: target.email, sessionsRevoked: revoked },
      ipAddress: info.ipAddress,
    });
  }

  /** Forgets the secret and the recovery codes of an admin. */
  async clear(adminId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.adminRecoveryCode.deleteMany({ where: { adminId } }),
      this.prisma.adminUser.update({
        where: { id: adminId },
        data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
      }),
    ]);
  }

  /** The admin, once the password was checked. */
  private async verified(adminId: string, password: string): Promise<AdminUser> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (!(await verifyPassword(password, admin.passwordHash))) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'password_incorrect',
        message: 'The password is incorrect',
      });
    }
    return admin;
  }

  private async newRecoveryCodes(
    tx: Pick<PrismaClient, 'adminRecoveryCode'>,
    adminId: string,
  ): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await tx.adminRecoveryCode.deleteMany({ where: { adminId } });
    await tx.adminRecoveryCode.createMany({
      data: codes.map((code) => ({ adminId, codeHash: hashRecoveryCode(code) })),
    });
    return codes;
  }
}
