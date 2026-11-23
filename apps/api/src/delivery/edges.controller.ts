// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, Public, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { P2pService } from '../p2p/p2p.service.js';
import { type DeliveryOverview, DeliveryOverviewService } from './delivery-overview.service.js';
import {
  type CreateEdgeInput,
  createEdgeSchema,
  type PurgeInput,
  purgeSchema,
  type TrafficQuery,
  trafficQuerySchema,
  type UpdateEdgeInput,
  updateEdgeSchema,
} from './edges.schemas.js';
import {
  type EdgeView,
  type EdgeWithToken,
  EdgesService,
  type TrafficView,
} from './edges.service.js';

/** Edge servers: the machines that deliver video in place of the main server. */
@Controller('edges')
export class EdgesController {
  constructor(
    @Inject(EdgesService) private readonly edges: EdgesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DeliveryOverviewService) private readonly delivery: DeliveryOverviewService,
  ) {}

  @Get()
  @RequirePermissions('delivery:read')
  list(): Promise<EdgeView[]> {
    return this.edges.list();
  }

  /** What the edges delivered over the last day, week or month. Before ":id", which would take it. */
  @Get('traffic')
  @RequirePermissions('delivery:read')
  traffic(
    @Query(new ZodValidationPipe(trafficQuerySchema)) query: TrafficQuery,
  ): Promise<TrafficView> {
    return this.edges.traffic(query.range);
  }

  /** Who delivered what over the last day, week or month: main server, edges, viewers. */
  @Get('overview')
  @RequirePermissions('delivery:read')
  overview(
    @Query(new ZodValidationPipe(trafficQuerySchema)) query: TrafficQuery,
  ): Promise<DeliveryOverview> {
    return this.delivery.overview(query.range);
  }

  @Get(':id')
  @RequirePermissions('delivery:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EdgeView> {
    return this.edges.get(id);
  }

  /** Adds an edge. The answer carries the token of its agent, this once. */
  @Post()
  @RequirePermissions('delivery:write')
  async create(
    @Body(new ZodValidationPipe(createEdgeSchema)) body: CreateEdgeInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<EdgeWithToken> {
    const created = await this.edges.create(body);
    await this.record('edge.create', created.edge, principal, request);
    return created;
  }

  @Patch(':id')
  @RequirePermissions('delivery:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEdgeSchema)) body: UpdateEdgeInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<EdgeView> {
    const updated = await this.edges.update(id, body);
    await this.record('edge.update', updated, principal, request, { changed: Object.keys(body) });
    return updated;
  }

  /** Replaces the token of the agent. The old one stops working at once. */
  @Post(':id/token')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('delivery:write')
  async replaceToken(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<EdgeWithToken> {
    const replaced = await this.edges.replaceToken(id);
    await this.record('edge.token', replaced.edge, principal, request);
    return replaced;
  }

  /** Asks the agent to drop its copies: all of them, or those of videos or of live channels. */
  @Post(':id/purge')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('delivery:write')
  async purge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(purgeSchema)) body: PurgeInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<EdgeView> {
    const edge = await this.edges.purge(id, body.scope);
    await this.record('edge.purge', edge, principal, request, { scope: body.scope });
    return edge;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('delivery:write')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const removed = await this.edges.remove(id);
    await this.record('edge.delete', removed, principal, request);
  }

  private record(
    action: string,
    edge: EdgeView,
    principal: Principal,
    request: Request,
    more: Record<string, unknown> = {},
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'edge',
      entityId: edge.id,
      metadata: { name: edge.name, publicUrl: edge.publicUrl, ...more },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}

/**
 * What the viewer website needs to know about delivery: the addresses video
 * may come from and that of the tracker, which its content policy has to allow.
 */
@Public()
@Controller('catalog/delivery')
export class PublicDeliveryController {
  constructor(
    @Inject(EdgesService) private readonly edges: EdgesService,
    @Inject(P2pService) private readonly p2p: P2pService,
  ) {}

  /** Where video comes from besides the site itself: the edge servers and the tracker. */
  @Get()
  async get(): Promise<{ origins: string[]; tracker: string | null }> {
    return { origins: await this.edges.origins(), tracker: this.p2p.trackerOrigin() };
  }
}
