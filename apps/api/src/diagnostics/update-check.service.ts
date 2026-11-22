// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { appVersion } from '../common/app-version.js';
import { AppConfig } from '../config/app-config.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import type { VersionInfo } from './diagnostics.types.js';

export const LATEST_COMMIT_KEY = 'onyx:diagnostics:latest-commit';
/** An answer is good for this long. Nobody needs to know of a new version within the hour. */
const ASK_EVERY_SECONDS = 6 * 60 * 60;
/** After a failure the next try comes sooner, but not at once. */
const ASK_AGAIN_SECONDS = 30 * 60;
const TIMEOUT_MS = 4000;

type Remembered = { commit: string } | { error: string };

/** Whether one commit names the other. A short one matches the start of a long one. */
export function sameCommit(a: string, b: string): boolean {
  const short = Math.min(a.length, b.length);
  return short >= 7 && a.slice(0, short) === b.slice(0, short);
}

/**
 * Finds out whether a newer version exists.
 *
 * It asks one address for the newest commit, at most every six hours, and
 * sends nothing about the installation with the question. UPDATE_CHECK=off
 * switches it off.
 */
@Injectable()
export class UpdateCheckService {
  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async version(): Promise<VersionInfo> {
    const base = {
      version: appVersion(),
      commit: this.config.commit,
      node: process.versions.node,
    };
    const unknown = (updateNote: string, latestCommit: string | null = null): VersionInfo => ({
      ...base,
      update: 'unknown',
      latestCommit,
      updateNote,
    });

    if (!this.config.updateCheckUrl) {
      return unknown('Looking for newer versions is switched off (UPDATE_CHECK=off).');
    }
    const latest = await this.latest(this.config.updateCheckUrl);
    if ('error' in latest) {
      return unknown(`The newest version could not be looked up: ${latest.error}`);
    }
    if (!base.commit) {
      return unknown(
        'This installation does not know which commit it was built from, so it cannot be compared. Run "onyx update --check" on the server.',
        latest.commit,
      );
    }
    return {
      ...base,
      update: sameCommit(base.commit, latest.commit) ? 'current' : 'available',
      latestCommit: latest.commit,
      updateNote: null,
    };
  }

  private async latest(url: string): Promise<Remembered> {
    const remembered = await this.redis.get(LATEST_COMMIT_KEY).catch(() => null);
    if (remembered) {
      try {
        return JSON.parse(remembered) as Remembered;
      } catch {
        // Asked again below.
      }
    }
    let answer: Remembered;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/vnd.github.sha', 'User-Agent': 'spark-onyx-stream' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = (await response.text()).trim().toLowerCase();
      if (!response.ok) {
        throw new Error(`the answer was ${response.status}`);
      }
      if (!/^[0-9a-f]{7,40}$/.test(text)) {
        throw new Error('the answer was not a commit');
      }
      answer = { commit: text };
    } catch (error) {
      answer = { error: (error as Error).message };
    }
    await this.redis
      .set(
        LATEST_COMMIT_KEY,
        JSON.stringify(answer),
        'EX',
        'commit' in answer ? ASK_EVERY_SECONDS : ASK_AGAIN_SECONDS,
      )
      .catch(() => undefined);
    return answer;
  }
}
