// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient, type Viewer, type ViewerTokenKind } from '@onyx/database';
import { hashPassword } from '../auth/password-hasher.js';
import { generateMailToken, hashToken, MAIL_TOKEN_PREFIX } from '../auth/tokens.js';
import { AppConfig } from '../config/app-config.js';
import { MailService } from '../mail/mail.service.js';
import {
  passwordChangedMail,
  passwordResetMail,
  verificationMail,
} from '../mail/mail.templates.js';
import { ViewerSessionService } from './viewer-session.service.js';

/** A link to set a new password is a key to the account, so it is short-lived. */
export const RESET_VALID_MINUTES = 60;
/** A link to confirm an address opens nothing, and people read mail late. */
export const VERIFICATION_VALID_MINUTES = 3 * 24 * 60;
/**
 * The shortest time between two emails of one kind to one viewer. Without it
 * anyone who knows an address could fill its inbox.
 */
export const MIN_SECONDS_BETWEEN_MAILS = 120;

/** Pages of the viewer website the links lead to. The token rides in the fragment. */
const PAGES: Record<ViewerTokenKind, string> = {
  PASSWORD_RESET: '/reset-password',
  EMAIL_VERIFICATION: '/verify-email',
};

const LIFETIMES: Record<ViewerTokenKind, number> = {
  PASSWORD_RESET: RESET_VALID_MINUTES,
  EMAIL_VERIFICATION: VERIFICATION_VALID_MINUTES,
};

const INVALID_LINK = 'This link has expired or was already used. Ask for a new one.';

/**
 * The emails of viewer accounts: confirming an address and setting a new
 * password. A link carries a random token of which only a hash is stored. It
 * works once, for a limited time, and only for the address it was sent to.
 */
@Injectable()
export class ViewerEmailService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(ViewerSessionService) private readonly sessions: ViewerSessionService,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  get enabled(): boolean {
    return this.mail.enabled;
  }

  /**
   * Sends a link to set a new password, if the address belongs to an account
   * that may sign in. Says nothing about whether it did: the answer is the
   * same for every address.
   *
   * @throws ServiceUnavailableException when email is off.
   */
  async requestPasswordReset(email: string): Promise<void> {
    this.assertEnabled();
    const viewer = await this.prisma.viewer.findUnique({ where: { email } });
    if (!viewer || viewer.status !== 'ACTIVE') {
      return;
    }
    await this.sendLink(viewer, 'PASSWORD_RESET', { quietWhenTooSoon: true });
  }

  /**
   * Sends the link for an admin who helps a viewer.
   *
   * @throws ServiceUnavailableException when email is off.
   * @throws HttpException 429 when one was sent a moment ago.
   */
  async sendPasswordReset(viewer: Viewer): Promise<void> {
    this.assertEnabled();
    await this.sendLink(viewer, 'PASSWORD_RESET', { quietWhenTooSoon: false });
  }

  /**
   * Sets a new password with the token of a link, and signs the viewer out
   * everywhere. Whoever holds the link reads the viewer's mail, so the
   * address counts as confirmed as well.
   *
   * @throws BadRequestException when the link does not work (any more).
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const viewer = await this.redeem(token, 'PASSWORD_RESET');
    await this.prisma.viewer.update({
      where: { id: viewer.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        emailVerifiedAt: viewer.emailVerifiedAt ?? new Date(),
      },
    });
    // The address counts as confirmed now, so a link to confirm it has no use.
    await this.prisma.viewerToken.deleteMany({ where: { viewerId: viewer.id } });
    await this.sessions.revokeAll(viewer.id);
    if (this.mail.enabled) {
      this.mail.send({
        to: viewer.email,
        ...passwordChangedMail({
          siteName: this.config.siteName,
          displayName: viewer.displayName,
        }),
      });
    }
  }

  /**
   * Sends the link to confirm the address after sign-up. Does nothing when
   * email is off, and never fails: the account exists either way.
   */
  async sendWelcomeVerification(viewer: Viewer): Promise<void> {
    if (!this.mail.enabled || viewer.emailVerifiedAt) {
      return;
    }
    await this.sendLink(viewer, 'EMAIL_VERIFICATION', { quietWhenTooSoon: true });
  }

  /**
   * Sends the link to confirm the address again, when the viewer or an admin
   * asks for it.
   *
   * @throws ServiceUnavailableException when email is off.
   * @throws ConflictException when the address is confirmed already.
   * @throws HttpException 429 when one was sent a moment ago.
   */
  async sendVerification(viewer: Viewer): Promise<void> {
    this.assertEnabled();
    if (viewer.emailVerifiedAt) {
      throw new ConflictException('This email address is confirmed already');
    }
    await this.sendLink(viewer, 'EMAIL_VERIFICATION', { quietWhenTooSoon: false });
  }

  /**
   * Confirms the address with the token of a link.
   *
   * @returns the confirmed address, to show it.
   * @throws BadRequestException when the link does not work (any more).
   */
  async verifyEmail(token: string): Promise<{ email: string }> {
    const viewer = await this.redeem(token, 'EMAIL_VERIFICATION');
    if (!viewer.emailVerifiedAt) {
      await this.prisma.viewer.update({
        where: { id: viewer.id },
        data: { emailVerifiedAt: new Date() },
      });
    }
    return { email: viewer.email };
  }

  private assertEnabled(): void {
    if (!this.mail.enabled) {
      throw new ServiceUnavailableException('Email is not set up on this site');
    }
  }

  private async sendLink(
    viewer: Viewer,
    kind: ViewerTokenKind,
    { quietWhenTooSoon }: { quietWhenTooSoon: boolean },
  ): Promise<void> {
    const latest = await this.prisma.viewerToken.findFirst({
      where: { viewerId: viewer.id, kind },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const waitSeconds = latest
      ? MIN_SECONDS_BETWEEN_MAILS - Math.floor((Date.now() - latest.createdAt.getTime()) / 1000)
      : 0;
    if (waitSeconds > 0) {
      if (quietWhenTooSoon) {
        return;
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'An email was sent a moment ago. Check the inbox, or try again shortly.',
          // Lets a client tell this apart from too many attempts at something.
          code: 'mail_recently_sent',
          retryAfterSeconds: waitSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { token, tokenHash } = generateMailToken();
    const validMinutes = LIFETIMES[kind];
    // A new link replaces the older ones, so only the latest email works.
    await this.prisma.$transaction([
      this.prisma.viewerToken.deleteMany({ where: { viewerId: viewer.id, kind } }),
      this.prisma.viewerToken.create({
        data: {
          viewerId: viewer.id,
          kind,
          tokenHash,
          email: viewer.email,
          expiresAt: new Date(Date.now() + validMinutes * 60_000),
        },
      }),
    ]);

    // In the fragment, which browsers send to no server and put in no log.
    const link = {
      siteName: this.config.siteName,
      displayName: viewer.displayName,
      url: `${this.config.siteUrl}${PAGES[kind]}#token=${token}`,
      validMinutes,
    };
    this.mail.send({
      to: viewer.email,
      ...(kind === 'PASSWORD_RESET' ? passwordResetMail(link) : verificationMail(link)),
    });
  }

  /**
   * Uses up a token and returns the viewer it belongs to. All links of the
   * kind go with it.
   */
  private async redeem(token: string, kind: ViewerTokenKind): Promise<Viewer> {
    if (!token.startsWith(MAIL_TOKEN_PREFIX)) {
      throw new BadRequestException(INVALID_LINK);
    }
    const found = await this.prisma.viewerToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { viewer: true },
    });
    if (
      !found ||
      found.kind !== kind ||
      found.expiresAt.getTime() <= Date.now() ||
      // The address was changed after the link was sent.
      found.email !== found.viewer.email ||
      found.viewer.status !== 'ACTIVE'
    ) {
      throw new BadRequestException(INVALID_LINK);
    }
    // Deleting decides who wins when a link is used twice at the same moment.
    const { count } = await this.prisma.viewerToken.deleteMany({ where: { id: found.id } });
    if (count === 0) {
      throw new BadRequestException(INVALID_LINK);
    }
    await this.prisma.viewerToken.deleteMany({ where: { viewerId: found.viewerId, kind } });
    return found.viewer;
  }
}
