// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { type Prisma, PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import {
  APP_VERSIONS_SETTINGS_KEY,
  type AppVersionRule,
  type ClientIdentity,
  defaultMessage,
  readRules,
  ruleAgainst,
} from './app-version.rules.js';

/** How long a process trusts what it read, in milliseconds. */
const KEPT_MS = 10_000;

/** What an app that is too old is told. */
export interface ClientRefusal {
  minimumVersion: string;
  message: string;
  updateUrl: string | null;
}

/** The oldest version of each app that may still use the installation. */
@Injectable()
export class AppVersionsService {
  private kept: { rules: AppVersionRule[]; at: number } | null = null;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  async rules(): Promise<AppVersionRule[]> {
    // Tests empty the database between cases, behind the back of this memory.
    const remember = this.config.nodeEnv !== 'test';
    if (remember && this.kept && Date.now() - this.kept.at < KEPT_MS) {
      return this.kept.rules;
    }
    const stored = await this.prisma.setting.findUnique({
      where: { key: APP_VERSIONS_SETTINGS_KEY },
    });
    const rules = readRules(stored?.value);
    this.kept = { rules, at: Date.now() };
    return rules;
  }

  async save(rules: AppVersionRule[]): Promise<AppVersionRule[]> {
    const sorted = rules.toSorted((a, b) => a.app.localeCompare(b.app));
    const value = sorted as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({
      where: { key: APP_VERSIONS_SETTINGS_KEY },
      create: { key: APP_VERSIONS_SETTINGS_KEY, value },
      update: { value },
    });
    this.kept = null;
    return sorted;
  }

  /**
   * Whether an app has to be turned away.
   *
   * Never fails: when the rules cannot be read, apps are let through. A
   * database that stumbles should not lock every viewer out of their app.
   */
  async refusalFor(client: ClientIdentity): Promise<ClientRefusal | null> {
    let rules: AppVersionRule[];
    try {
      rules = await this.rules();
    } catch {
      return null;
    }
    const rule = ruleAgainst(client, rules);
    return rule
      ? {
          minimumVersion: rule.minimum,
          message: rule.message ?? defaultMessage(),
          updateUrl: rule.updateUrl,
        }
      : null;
  }
}
