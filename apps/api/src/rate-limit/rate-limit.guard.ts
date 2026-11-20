// SPDX-License-Identifier: AGPL-3.0-only
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { type RateLimitRule, RateLimitService } from './rate-limit.service.js';

const RATE_LIMIT_KEY = 'onyx:rateLimit';

/**
 * Limits how often one client may call an endpoint, or a whole controller.
 * Endpoints with the same rule name share one counter.
 */
export const RateLimit = (rule: RateLimitRule) =>
  applyDecorators(SetMetadata(RATE_LIMIT_KEY, rule), UseGuards(RateLimitGuard));

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const result = await this.rateLimit.hit(rule, request.ip ?? 'unknown');
    if (result.allowed) {
      return true;
    }

    http.getResponse<Response>().setHeader('Retry-After', String(result.retryAfterSeconds));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: 'Too many requests. Try again in a moment.',
        retryAfterSeconds: result.retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
