// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { VIEWER_COOKIE, viewerCookieOptions } from './cookies.js';
import {
  type ChangeViewerPasswordInput,
  changeViewerPasswordSchema,
  type DeleteOwnViewerInput,
  deleteOwnViewerSchema,
  type ForgotViewerPasswordInput,
  forgotViewerPasswordSchema,
  type ResetViewerPasswordByMailInput,
  resetViewerPasswordByMailSchema,
  type VerifyViewerEmailInput,
  verifyViewerEmailSchema,
  type LoginViewerInput,
  loginViewerSchema,
  type RegisterViewerInput,
  registerViewerSchema,
  type UpdateOwnViewerInput,
  updateOwnViewerSchema,
} from './viewer.schemas.js';
import { toViewerView, type ViewerSessionView, type ViewerView } from './viewer.view.js';
import type { ViewerAccess } from '../billing/entitlement.js';
import { CurrentViewer, ViewerOnly } from './viewer-auth.guard.js';
import {
  type OwnedTitleRef,
  type ViewerAccessConfig,
  ViewerAuthService,
  type ViewerSignIn,
} from './viewer-auth.service.js';
import { ViewerEmailService } from './viewer-email.service.js';
import {
  type ProfileView,
  toProfileView,
  ViewerProfilesService,
} from './viewer-profiles.service.js';
import { type ViewerIdentity, ViewerSessionService } from './viewer-session.service.js';

/** Route of the viewer accounts, relative to the API prefix. */
export const VIEWER_ROUTE = 'viewer';

/** New accounts from one address. Generous for a family, tight for a script. */
const REGISTRATIONS = { name: 'viewer-register', limit: 10, windowSeconds: 3600 };
/** Sign-in attempts from one address, on top of the limit per email address. */
const SIGN_INS = { name: 'viewer-login', limit: 30, windowSeconds: 300 };
/** Requests for an email from one address. Each one may send mail to a stranger. */
const MAIL_REQUESTS = { name: 'viewer-mail', limit: 8, windowSeconds: 900 };
/** Tries of a link's token from one address. Tokens cannot be guessed; this stops trying anyway. */
const LINK_USES = { name: 'viewer-link', limit: 20, windowSeconds: 900 };

/**
 * Accounts of viewers: sign-up, sign-in and the viewer's own settings.
 * Answers about one person are never cached.
 */
@Controller(VIEWER_ROUTE)
export class ViewerAuthController {
  constructor(
    @Inject(ViewerAuthService) private readonly auth: ViewerAuthService,
    @Inject(ViewerSessionService) private readonly viewerSessions: ViewerSessionService,
    @Inject(ViewerEmailService) private readonly emails: ViewerEmailService,
    @Inject(ViewerProfilesService) private readonly profiles: ViewerProfilesService,
  ) {}

  /** What the website needs to know to show the right buttons. */
  @Public()
  @Get('config')
  @Header('Cache-Control', 'public, max-age=30')
  config(): ViewerAccessConfig {
    return this.auth.accessConfig();
  }

  /**
   * Who is signed in, or nobody. Unlike "me" this is not an error for a
   * visitor, so the website can ask on every page without filling the
   * browser's console with failed requests.
   */
  @Public()
  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(@Req() request: Request): Promise<{
    viewer: ViewerView | null;
    profile: ProfileView | null;
    entitled: boolean;
    access: ViewerAccess;
    purchases: OwnedTitleRef[];
  }> {
    const identity = await this.viewerSessions.identify(request);
    if (!identity) {
      return { viewer: null, profile: null, entitled: false, access: null, purchases: [] };
    }
    const [profile, access, purchases] = await Promise.all([
      this.profiles.current(identity),
      this.auth.subscriptionAccess(identity.viewer.id),
      this.auth.ownedTitles(identity.viewer.id),
    ]);
    const entitled = access !== null;
    return {
      viewer: toViewerView(identity.viewer),
      // Who is watching on this device.
      profile: toProfileView(profile),
      // Whether the viewer has a running subscription, and which paid titles it opens.
      entitled,
      access,
      // Titles rented or bought, which are open whatever the plan.
      purchases,
    };
  }

  @Public()
  @RateLimit(REGISTRATIONS)
  @Post('register')
  @Header('Cache-Control', 'no-store')
  async register(
    @Body(new ZodValidationPipe(registerViewerSchema)) body: RegisterViewerInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ViewerSignIn> {
    return this.signedIn(await this.auth.register(body, requestInfo(request)), request, response);
  }

  @Public()
  @RateLimit(SIGN_INS)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body(new ZodValidationPipe(loginViewerSchema)) body: LoginViewerInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ViewerSignIn> {
    return this.signedIn(await this.auth.login(body, requestInfo(request)), request, response);
  }

  @ViewerOnly()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentViewer() identity: ViewerIdentity,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(identity);
    response.clearCookie(VIEWER_COOKIE, viewerCookieOptions(request));
  }

  @ViewerOnly()
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentViewer() identity: ViewerIdentity): ViewerView {
    return toViewerView(identity.viewer);
  }

  @ViewerOnly()
  @Patch('me')
  updateOwn(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(updateOwnViewerSchema)) body: UpdateOwnViewerInput,
  ): Promise<ViewerView> {
    return this.auth.updateOwn(identity, body);
  }

  @ViewerOnly()
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(changeViewerPasswordSchema)) body: ChangeViewerPasswordInput,
  ): Promise<void> {
    await this.auth.changePassword(identity, body);
  }

  /**
   * Asks for a link to set a new password. The answer is the same whether or
   * not the address belongs to an account.
   */
  @Public()
  @RateLimit(MAIL_REQUESTS)
  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotViewerPasswordSchema)) body: ForgotViewerPasswordInput,
  ): Promise<void> {
    await this.emails.requestPasswordReset(body.email);
  }

  /** Sets a new password with the token of the link. Signs the viewer out everywhere. */
  @Public()
  @RateLimit(LINK_USES)
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(resetViewerPasswordByMailSchema))
    body: ResetViewerPasswordByMailInput,
  ): Promise<void> {
    await this.emails.resetPassword(body.token, body.newPassword);
  }

  /**
   * Confirms the address with the token of the link. Needs no sign-in: the
   * link is often opened on another device than the one that signed up.
   */
  @Public()
  @RateLimit(LINK_USES)
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  verifyEmail(
    @Body(new ZodValidationPipe(verifyViewerEmailSchema)) body: VerifyViewerEmailInput,
  ): Promise<{ email: string }> {
    return this.emails.verifyEmail(body.token);
  }

  /** Sends the link to confirm the address again. */
  @ViewerOnly()
  @RateLimit(MAIL_REQUESTS)
  @Post('email/send')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendVerification(@CurrentViewer() identity: ViewerIdentity): Promise<void> {
    await this.emails.sendVerification(identity.viewer);
  }

  /** The devices the viewer is signed in on. */
  @ViewerOnly()
  @Get('sessions')
  @Header('Cache-Control', 'no-store')
  sessions(@CurrentViewer() identity: ViewerIdentity): Promise<ViewerSessionView[]> {
    return this.auth.listSessions(identity);
  }

  @ViewerOnly()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (!(await this.auth.revokeSession(identity, id))) {
      throw new NotFoundException('Session not found');
    }
  }

  /** Deletes the viewer's own account. POST, because it carries the password. */
  @ViewerOnly()
  @Post('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOwn(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(deleteOwnViewerSchema)) body: DeleteOwnViewerInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.deleteOwn(identity, body.password);
    response.clearCookie(VIEWER_COOKIE, viewerCookieOptions(request));
  }

  /** Hands the new session to the browser as a cookie, and to apps in the answer. */
  private signedIn(result: ViewerSignIn, request: Request, response: Response): ViewerSignIn {
    response.cookie(VIEWER_COOKIE, result.token, viewerCookieOptions(request, result.expiresAt));
    return result;
  }
}
