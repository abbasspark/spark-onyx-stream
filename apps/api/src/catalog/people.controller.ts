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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CreateGenreInput,
  createGenreSchema,
  type CreatePersonInput,
  createPersonSchema,
  type ListPeopleInput,
  listPeopleSchema,
  type ReplaceCreditsInput,
  replaceCreditsSchema,
  type UpdateGenreInput,
  updateGenreSchema,
  type UpdatePersonInput,
  updatePersonSchema,
} from './catalog.schemas.js';
import type { CreditView, GenreView, PersonDetail, PersonView } from './catalog.views.js';
import { PeopleService } from './people.service.js';

/** Genres, people, and who had which part in a title. */
@Controller()
export class PeopleController {
  constructor(
    @Inject(PeopleService) private readonly people: PeopleService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private record(
    action: string,
    entityType: string,
    entityId: string,
    principal: Principal,
    request: Request,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType,
      entityId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }

  // --- Genres -------------------------------------------------------------------

  @Get('genres')
  @RequirePermissions('catalog:read')
  listGenres(): Promise<GenreView[]> {
    return this.people.listGenres();
  }

  @Post('genres')
  @RequirePermissions('catalog:write')
  async createGenre(
    @Body(new ZodValidationPipe(createGenreSchema)) body: CreateGenreInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<GenreView> {
    const genre = await this.people.createGenre(body);
    await this.record('genre.create', 'Genre', genre.id, principal, request, { name: genre.name });
    return genre;
  }

  @Patch('genres/:id')
  @RequirePermissions('catalog:write')
  async updateGenre(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateGenreSchema)) body: UpdateGenreInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<GenreView> {
    const genre = await this.people.updateGenre(id, body);
    await this.record('genre.update', 'Genre', id, principal, request, { name: genre.name });
    return genre;
  }

  @Delete('genres/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('catalog:write')
  async removeGenre(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const genre = await this.people.removeGenre(id);
    await this.record('genre.delete', 'Genre', id, principal, request, {
      name: genre.name,
      titles: genre.titleCount,
    });
  }

  // --- People -------------------------------------------------------------------

  @Get('people')
  @RequirePermissions('catalog:read')
  listPeople(
    @Query(new ZodValidationPipe(listPeopleSchema)) query: ListPeopleInput,
  ): Promise<Page<PersonView>> {
    return this.people.listPeople(query);
  }

  @Get('people/:id')
  @RequirePermissions('catalog:read')
  getPerson(@Param('id', ParseUUIDPipe) id: string): Promise<PersonDetail> {
    return this.people.getPerson(id);
  }

  @Post('people')
  @RequirePermissions('catalog:write')
  async createPerson(
    @Body(new ZodValidationPipe(createPersonSchema)) body: CreatePersonInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PersonView> {
    const person = await this.people.createPerson(body);
    await this.record('person.create', 'Person', person.id, principal, request, {
      name: person.name,
    });
    return person;
  }

  @Patch('people/:id')
  @RequirePermissions('catalog:write')
  async updatePerson(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePersonSchema)) body: UpdatePersonInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PersonView> {
    const person = await this.people.updatePerson(id, body);
    await this.record('person.update', 'Person', id, principal, request, {
      name: person.name,
      changed: Object.keys(body),
    });
    return person;
  }

  @Delete('people/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('catalog:write')
  async removePerson(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const person = await this.people.removePerson(id);
    await this.record('person.delete', 'Person', id, principal, request, {
      name: person.name,
      credits: person.creditCount,
    });
  }

  // --- Credits ------------------------------------------------------------------

  /** Replaces the cast and crew of a title with the list given, in its order. */
  @Put('titles/:id/credits')
  @RequirePermissions('catalog:write')
  async replaceCredits(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replaceCreditsSchema)) body: ReplaceCreditsInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<CreditView[]> {
    const credits = await this.people.replaceCredits(id, body);
    await this.record('title.credits', 'Title', id, principal, request, {
      cast: credits.filter((credit) => credit.kind === 'CAST').length,
      crew: credits.filter((credit) => credit.kind === 'CREW').length,
    });
    return credits;
  }
}
