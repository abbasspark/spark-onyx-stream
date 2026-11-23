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
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import type { PublicTitleCard } from '../catalog/public-catalog.views.js';
import { toPublicCard } from '../catalog/public-catalog.views.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AppConfig } from '../config/app-config.js';
import {
  type CreateSectionInput,
  createSectionSchema,
  type OrderSectionsInput,
  orderSectionsSchema,
  type UpdateSectionInput,
  updateSectionSchema,
} from './home.schemas.js';
import { type HomeSectionView, HomeService, type HomeView } from './home.service.js';

/** A section as the panel gets it: its preview as cards with their pictures. */
export type HomeSectionAnswer = Omit<HomeSectionView, 'preview'> & { preview: PublicTitleCard[] };
export interface HomeAnswer {
  /** False while the page puts itself together. */
  custom: boolean;
  sections: HomeSectionAnswer[];
}

/** The home page of the website, as admins arrange it. */
@Controller('home')
export class HomeController {
  constructor(
    @Inject(HomeService) private readonly home: HomeService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  private section(view: HomeSectionView): HomeSectionAnswer {
    return {
      ...view,
      preview: view.preview.map((title) => toPublicCard(title, this.config.mediaBaseUrl)),
    };
  }

  private answer(view: HomeView): HomeAnswer {
    return { custom: view.custom, sections: view.sections.map((entry) => this.section(entry)) };
  }

  private record(
    action: string,
    principal: Principal,
    request: Request,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'HomeSection',
      entityId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }

  @Get()
  @RequirePermissions('catalog:read')
  async get(): Promise<HomeAnswer> {
    return this.answer(await this.home.get());
  }

  /** Takes the page over from the automatic one, starting with what it shows now. */
  @Post('start')
  @RequirePermissions('catalog:write')
  async start(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<HomeAnswer> {
    const view = await this.home.start();
    await this.record('home.start', principal, request, undefined, {
      sections: view.sections.length,
    });
    return this.answer(view);
  }

  /** Deletes every section: the page puts itself together again. */
  @Delete()
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@CurrentPrincipal() principal: Principal, @Req() request: Request): Promise<void> {
    const sections = await this.home.reset();
    await this.record('home.reset', principal, request, undefined, { sections });
  }

  @Post('sections')
  @RequirePermissions('catalog:write')
  async create(
    @Body(new ZodValidationPipe(createSectionSchema)) body: CreateSectionInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<HomeSectionAnswer> {
    const view = await this.home.create(body);
    await this.record('home.section.create', principal, request, view.id, {
      kind: view.kind,
      name: view.name ?? view.defaultName,
    });
    return this.section(view);
  }

  /** Before ":id", so that "order" is not read as an id. */
  @Put('sections/order')
  @RequirePermissions('catalog:write')
  async order(
    @Body(new ZodValidationPipe(orderSectionsSchema)) body: OrderSectionsInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<HomeAnswer> {
    const view = await this.home.order(body.ids);
    await this.record('home.reorder', principal, request);
    return this.answer(view);
  }

  @Patch('sections/:id')
  @RequirePermissions('catalog:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSectionSchema)) body: UpdateSectionInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<HomeSectionAnswer> {
    const view = await this.home.update(id, body);
    await this.record('home.section.update', principal, request, id, {
      name: view.name ?? view.defaultName,
      changed: Object.keys(body),
    });
    return this.section(view);
  }

  @Delete('sections/:id')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const view = await this.home.remove(id);
    await this.record('home.section.delete', principal, request, id, {
      kind: view.kind,
      name: view.name ?? view.defaultName,
    });
  }
}
