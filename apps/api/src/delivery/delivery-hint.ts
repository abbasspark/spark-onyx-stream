// SPDX-License-Identifier: AGPL-3.0-only
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

/** What a player says about the servers when it asks for an address. */
export interface DeliveryHint {
  /** Origin of the server the player just failed on, which it should not be sent to again. */
  avoid: string | null;
}

/**
 * Carries the hint from the request to the router, through whatever lies in
 * between, so the services that decide who may watch need not know about it.
 */
export const deliveryHint = new AsyncLocalStorage<DeliveryHint>();

const ORIGIN_PATTERN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/;

/** Reads "?avoid=https://edge1.example.com" of a playback request. Null for anything else. */
export function avoidOf(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 200) {
    return null;
  }
  const origin = value.trim().replace(/\/+$/, '').toLowerCase();
  return ORIGIN_PATTERN.test(origin) ? origin : null;
}

/**
 * For endpoints that hand out addresses for watching. A player whose server
 * went away asks again and names that server, and gets another one.
 */
@Injectable()
export class DeliveryHintInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const hint: DeliveryHint = { avoid: avoidOf(request.query.avoid) };
    return new Observable((subscriber) =>
      deliveryHint.run(hint, () => next.handle().subscribe(subscriber)),
    );
  }
}
