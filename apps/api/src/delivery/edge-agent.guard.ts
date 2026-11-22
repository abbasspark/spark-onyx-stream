// SPDX-License-Identifier: AGPL-3.0-only
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { EdgeRegistry, type KnownEdge } from './edge-registry.service.js';

type EdgeRequest = Request & { edge?: KnownEdge };

/** Lets in only edge agents, which sign in with the token of their edge. */
@Injectable()
export class EdgeAgentGuard implements CanActivate {
  constructor(@Inject(EdgeRegistry) private readonly registry: EdgeRegistry) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<EdgeRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const edge = token ? await this.registry.authenticate(token) : null;
    if (!edge) {
      throw new UnauthorizedException('This token does not belong to an edge server');
    }
    request.edge = edge;
    return true;
  }
}

/** The edge whose agent makes the request. */
export const CurrentEdge = createParamDecorator(
  (_data: unknown, context: ExecutionContext): KnownEdge => {
    const edge = context.switchToHttp().getRequest<EdgeRequest>().edge;
    if (!edge) {
      throw new UnauthorizedException();
    }
    return edge;
  },
);
