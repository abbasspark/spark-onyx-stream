// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@onyx/database';
import { LoginThrottleService } from '../auth/login-throttle.service.js';
import { hashPassword, needsRehash, verifyPassword } from '../auth/password-hasher.js';
import type { RequestInfo } from '../auth/request-info.js';
import { AppConfig } from '../config/app-config.js';
import type {
  ChangeViewerPasswordInput,
  LoginViewerInput,
  RegisterViewerInput,
  UpdateOwnViewerInput,
} from './viewer.schemas.js';
import {
  toViewerSessionView,
  toViewerView,
  type ViewerSessionView,
  type ViewerView,
} from './viewer.view.js';
import { ACCESS_SELECT, accessOf, runningAt, type ViewerAccess } from '../billing/entitlement.js';
import { ViewerEmailService } from './viewer-email.service.js';
import {
  type ProfileView,
  toProfileView,
  ViewerProfilesService,
} from './viewer-profiles.service.js';
import { type ViewerIdentity, ViewerSessionService } from './viewer-session.service.js';

/**
 * A valid hash of a random password. Verifying against it when the email is
 * unknown makes that case take as long as a wrong password.
 */
const DUMMY_HASH_PROMISE = hashPassword(`dummy-${Math.random()}-${Date.now()}`);

/** Keeps failed sign-ins of viewers apart from those of admins with the same email. */
const throttleKey = (email: string) => `viewer:${email}`;

export interface ViewerSignIn {
  viewer: ViewerView;
  /** The profile in use after signing in: the main one. */
  profile: ProfileView;
  /** For apps, which send it in the Authorization header. The website gets it as a cookie. */
  token: string;
  expiresAt: Date;
}

/** What a client needs to know before showing sign-in or a player. */
export interface ViewerAccessConfig {
  /** Whether people can create an account themselves. */
  registration: 'open' | 'closed';
  /** Who may play: anyone, signed-in viewers only, or nobody. */
  playback: 'open' | 'viewers' | 'off';
  /** Whether the site sends email: "forgot password" and confirming an address work. */
  email: boolean;
  /** Whether a viewer must confirm their address before they can watch. */
  verification: 'optional' | 'required';
}

/** Everything a viewer does with their own account. */
@Injectable()
export class ViewerAuthService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(ViewerSessionService) private readonly sessions: ViewerSessionService,
    @Inject(LoginThrottleService) private readonly throttle: LoginThrottleService,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(ViewerEmailService) private readonly emails: ViewerEmailService,
    @Inject(ViewerProfilesService) private readonly profiles: ViewerProfilesService,
  ) {}

  /** What the viewer's subscription opens: everything, or some packages. Null without one. */
  async subscriptionAccess(viewerId: string): Promise<ViewerAccess> {
    const running = await this.prisma.subscription.findMany({
      where: { viewerId, ...runningAt() },
      select: ACCESS_SELECT,
    });
    return accessOf(running);
  }

  accessConfig(): ViewerAccessConfig {
    return {
      registration: this.config.viewerRegistrationOpen ? 'open' : 'closed',
      playback: this.config.catalogPlayback,
      email: this.emails.enabled,
      verification: this.config.viewerVerificationRequired ? 'required' : 'optional',
    };
  }

  /**
   * Creates an account and signs the new viewer in.
   *
   * @throws ForbiddenException when registration is closed.
   * @throws ConflictException when the email address is taken.
   */
  async register(input: RegisterViewerInput, info: RequestInfo): Promise<ViewerSignIn> {
    if (!this.config.viewerRegistrationOpen) {
      throw new ForbiddenException('New accounts cannot be created on this site');
    }

    const passwordHash = await hashPassword(input.password);
    let viewer;
    try {
      viewer = await this.prisma.viewer.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          lastLoginAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email address already exists');
      }
      throw error;
    }

    await this.emails.sendWelcomeVerification(viewer);
    const { token, session } = await this.sessions.create(viewer.id, info);
    return {
      viewer: toViewerView(viewer),
      profile: toProfileView(await this.profiles.main(viewer)),
      token,
      expiresAt: session.expiresAt,
    };
  }

  /** @throws UnauthorizedException with one message for every cause. */
  async login(input: LoginViewerInput, info: RequestInfo): Promise<ViewerSignIn> {
    const key = throttleKey(input.email);
    const retryAfter = await this.throttle.retryAfterSeconds(key, info.ipAddress);
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

    const viewer = await this.prisma.viewer.findUnique({ where: { email: input.email } });
    const passwordMatches = await verifyPassword(
      input.password,
      viewer?.passwordHash ?? (await DUMMY_HASH_PROMISE),
    );
    if (!viewer || !passwordMatches || viewer.status !== 'ACTIVE') {
      await this.throttle.recordFailure(key, info.ipAddress);
      // One message for a wrong password, an unknown address and a disabled account.
      throw new UnauthorizedException('Email or password is incorrect');
    }

    await this.throttle.reset(key, info.ipAddress);
    const updated = await this.prisma.viewer.update({
      where: { id: viewer.id },
      data: {
        lastLoginAt: new Date(),
        ...(needsRehash(viewer.passwordHash)
          ? { passwordHash: await hashPassword(input.password) }
          : {}),
      },
    });
    const { token, session } = await this.sessions.create(viewer.id, info);
    return {
      viewer: toViewerView(updated),
      profile: toProfileView(await this.profiles.main(updated)),
      token,
      expiresAt: session.expiresAt,
    };
  }

  async logout(identity: ViewerIdentity): Promise<void> {
    await this.sessions.revoke(identity.viewer.id, identity.session.id);
  }

  async updateOwn(identity: ViewerIdentity, input: UpdateOwnViewerInput): Promise<ViewerView> {
    const viewer = await this.prisma.viewer.update({
      where: { id: identity.viewer.id },
      data: { displayName: input.displayName },
    });
    return toViewerView(viewer);
  }

  /** Changes the password and signs out every other device. */
  async changePassword(identity: ViewerIdentity, input: ChangeViewerPasswordInput): Promise<void> {
    if (!(await verifyPassword(input.currentPassword, identity.viewer.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException('The new password must differ from the current one');
    }
    await this.prisma.viewer.update({
      where: { id: identity.viewer.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    await this.sessions.revokeAll(identity.viewer.id, identity.session.id);
  }

  async listSessions(identity: ViewerIdentity): Promise<ViewerSessionView[]> {
    const sessions = await this.sessions.listActive(identity.viewer.id);
    return sessions.map((session) => toViewerSessionView(session, identity.session.id));
  }

  /** Signs out one device of the viewer. */
  async revokeSession(identity: ViewerIdentity, sessionId: string): Promise<boolean> {
    return this.sessions.revoke(identity.viewer.id, sessionId);
  }

  /**
   * Deletes the viewer's own account with everything stored about it.
   * The password is asked for again, so an unattended device is not enough.
   */
  async deleteOwn(identity: ViewerIdentity, password: string): Promise<void> {
    if (!(await verifyPassword(password, identity.viewer.passwordHash))) {
      throw new BadRequestException('Password is incorrect');
    }
    const paying = await this.prisma.subscription.findFirst({
      where: { viewerId: identity.viewer.id, source: 'STRIPE', ...runningAt() },
      select: { cancelAtPeriodEnd: true },
    });
    if (paying && !paying.cancelAtPeriodEnd) {
      // Deleting the account would not stop the payments.
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'subscription_running',
        message: 'Cancel your subscription first, so you are not charged again.',
      });
    }
    await this.prisma.viewer.delete({ where: { id: identity.viewer.id } });
  }
}
