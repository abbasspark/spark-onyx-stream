// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  type PipeTransform,
  Post,
  Put,
  Query,
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
import {
  type HomeSectionView,
  HomeService,
  type HomeView,
  LAYOUT_PAGES,
  type LayoutPage,
  type PageSummary,
} from './home.service.js';

/**
 * Reads the page from the address: "home", "movies", "series", "live",
 * "category" or "genre".
 *
 * @throws NotFoundException for anything else.
 */
@Injectable()
export class LayoutPagePipe implements PipeTransform<string, LayoutPage> {
  transform(value: string): LayoutPage {
    const page = value.toUpperCase() as LayoutPage;
    if (value !== value.toLowerCase() || !LAYOUT_PAGES.includes(page)) {
      throw new NotFoundException('There is no such page');
    }
    return page;
  }
}

/** A section as the panel gets it: its preview as cards with their pictures. */
export type HomeSectionAnswer = Omit<HomeSectionView, 'preview'> & { preview: PublicTitleCard[] };
export interface HomeAnswer {
  page: LayoutPage;
  /** On the page of categories or genres: the one the sections are shown with. */
  example: { id: string; slug: string; name: string } | null;
  /** False while the page has no sections and is what it is by itself. */
  custom: boolean;
  sections: HomeSectionAnswer[];
}

/**
 * The pages of the website that admins arrange: the home page, "Movies",
 * "Series", the live page, and the pages of categories and of genres.
 */
@Controller('layout')
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
    return {
      page: view.page,
      example: view.example,
      custom: view.custom,
      sections: view.sections.map((entry) => this.section(entry)),
    };
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

  /** Every page, with whether it is arranged and how many sections it has. */
  @Get()
  @RequirePermissions('catalog:read')
  pages(): Promise<PageSummary[]> {
    return this.home.pages();
  }

  /**
   * The sections of a page. On the page of categories or genres, `example`
   * names the one whose titles the sections are shown with.
   */
  @Get(':page')
  @RequirePermissions('catalog:read')
  async get(
    @Param('page', LayoutPagePipe) page: LayoutPage,
    @Query('example', new ParseUUIDPipe({ optional: true })) example?: string,
  ): Promise<HomeAnswer> {
    return this.answer(await this.home.get(page, new Date(), example));
  }

  /** Takes a page over, starting with sections made for it. */
  @Post(':page/start')
  @RequirePermissions('catalog:write')
  async start(
    @Param('page', LayoutPagePipe) page: LayoutPage,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<HomeAnswer> {
    const view = await this.home.start(page);
    await this.record('layout.start', principal, request, undefined, {
      page,
      sections: view.sections.length,
    });
    return this.answer(view);
  }

  /** Deletes every section of a page: it is again what it is by itself. */
  @Delete(':page')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(
    @Param('page', LayoutPagePipe) page: LayoutPage,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const sections = await this.home.reset(page);
    await this.record('layout.reset', principal, request, undefined, { page, sections });
  }

  @Post(':page/sections')
  @RequirePermissions('catalog:write')
  async create(
    @Param('page', LayoutPagePipe) page: LayoutPage,
    @Body(new ZodValidationPipe(createSectionSchema)) body: CreateSectionInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<HomeSectionAnswer> {
    const view = await this.home.create(page, body);
    await this.record('layout.section.create', principal, request, view.id, {
      page,
      kind: view.kind,
      name: view.name ?? view.defaultName,
    });
    return this.section(view);
  }

  @Put(':page/sections/order')
  @RequirePermissions('catalog:write')
  async order(
    @Param('page', LayoutPagePipe) page: LayoutPage,
    @Body(new ZodValidationPipe(orderSectionsSchema)) body: OrderSectionsInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<HomeAnswer> {
    const view = await this.home.order(page, body.ids);
    await this.record('layout.reorder', principal, request, undefined, { page });
    return this.answer(view);
  }

  /** A section is known by its id, whatever page it is on. */
  @Patch('sections/:id')
  @RequirePermissions('catalog:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSectionSchema)) body: UpdateSectionInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<HomeSectionAnswer> {
    const view = await this.home.update(id, body);
    await this.record('layout.section.update', principal, request, id, {
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
    await this.record('layout.section.delete', principal, request, id, {
      kind: view.kind,
      name: view.name ?? view.defaultName,
    });
  }
}
