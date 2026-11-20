// SPDX-License-Identifier: AGPL-3.0-only
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type ApiKey, PrismaClient } from '@onyx/database';
import { AuditService } from '../audit/audit.service.js';
import type { AdminPrincipal } from '../auth/principal.js';
import { generateApiKey } from '../auth/tokens.js';
import type { CreateApiKeyInput } from './api-keys.schemas.js';

/** An API key as returned by the API. Never includes the key or its hash. */
export interface ApiKeyView {
  id: string;
  name: string;
  /** Public start of the key, for recognizing it. */
  prefix: string;
  scopes: string[];
  createdBy: { id: string; displayName: string };
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreatedApiKey extends ApiKeyView {
  /** The full key. Shown once, at creation, and never again. */
  key: string;
}

type ApiKeyWithCreator = ApiKey & { createdBy: { id: string; displayName: string } };

const creatorSelect = { select: { id: true, displayName: true } } as const;

function toView(apiKey: ApiKeyWithCreator): ApiKeyView {
  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    scopes: apiKey.scopes,
    createdBy: apiKey.createdBy,
    lastUsedAt: apiKey.lastUsedAt,
    expiresAt: apiKey.expiresAt,
    revokedAt: apiKey.revokedAt,
    createdAt: apiKey.createdAt,
  };
}

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<ApiKeyView[]> {
    const keys = await this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: creatorSelect },
    });
    return keys.map(toView);
  }

  async create(
    actor: AdminPrincipal,
    input: CreateApiKeyInput,
    ipAddress: string | null,
  ): Promise<CreatedApiKey> {
    const notHeld = input.scopes.filter((scope) => !actor.permissions.includes(scope));
    if (notHeld.length > 0) {
      throw new ForbiddenException(
        `You cannot grant scopes you do not hold yourself: ${notHeld.join(', ')}`,
      );
    }

    const generated = generateApiKey();
    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: input.name,
        prefix: generated.prefix,
        keyHash: generated.keyHash,
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
        createdById: actor.adminId,
      },
      include: { createdBy: creatorSelect },
    });

    await this.audit.record({
      action: 'api_key.create',
      adminId: actor.adminId,
      entityType: 'ApiKey',
      entityId: apiKey.id,
      metadata: { name: apiKey.name, scopes: apiKey.scopes },
      ipAddress,
    });

    return { ...toView(apiKey), key: generated.key };
  }

  async revoke(actor: AdminPrincipal, id: string, ipAddress: string | null): Promise<void> {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    if (apiKey.revokedAt) {
      return;
    }

    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.record({
      action: 'api_key.revoke',
      adminId: actor.adminId,
      entityType: 'ApiKey',
      entityId: id,
      metadata: { name: apiKey.name },
      ipAddress,
    });
  }
}
