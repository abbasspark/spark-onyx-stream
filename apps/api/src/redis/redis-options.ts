// SPDX-License-Identifier: AGPL-3.0-only
import type { RedisOptions } from 'ioredis';

/**
 * Converts a redis:// or rediss:// URL into ioredis connection options.
 *
 * Parsing here, before a client is created, turns a malformed URL into a
 * clear startup error.
 *
 * @throws Error when the URL cannot be parsed or uses another protocol.
 */
export function redisOptionsFromUrl(url: string): RedisOptions {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('REDIS_URL is not a valid URL');
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use the redis:// or rediss:// protocol');
  }

  const options: RedisOptions = {
    host: parsed.hostname || 'localhost',
    port: parsed.port ? Number(parsed.port) : 6379,
  };

  if (parsed.username) {
    options.username = decodeURIComponent(parsed.username);
  }
  if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }

  const database = parsed.pathname.replace(/^\//, '');
  if (database.length > 0) {
    const index = Number(database);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error('REDIS_URL database must be a non-negative integer');
    }
    options.db = index;
  }

  if (parsed.protocol === 'rediss:') {
    options.tls = {};
  }

  return options;
}
