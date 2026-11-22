// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadGatewayException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import type { TmdbKind } from './tmdb.mapper.js';
import type { TmdbDetails, TmdbSearchPage, TmdbSeason } from './tmdb.types.js';

/** How long TMDB gets to answer one request. */
const TIMEOUT_MS = 15_000;
/** The longest wait TMDB may ask for before a request is tried again. */
const MAX_RETRY_WAIT_MS = 4_000;

/** The shorter "API Key" of a TMDB account. Everything else is its access token. */
const API_KEY_PATTERN = /^[0-9a-f]{32}$/i;

/** Talks to The Movie Database. Knows its addresses and its errors, nothing of the catalog. */
@Injectable()
export class TmdbClient {
  constructor(@Inject(AppConfig) private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.tmdb !== null;
  }

  search(
    kind: TmdbKind,
    query: string,
    options: { language: string; year?: number },
  ): Promise<TmdbSearchPage> {
    return this.get<TmdbSearchPage>(`/search/${kind}`, {
      query,
      language: options.language,
      include_adult: 'false',
      page: '1',
      ...(options.year
        ? { [kind === 'movie' ? 'year' : 'first_air_date_year']: String(options.year) }
        : {}),
    });
  }

  /** A title with its age ratings, its logos, the people in it and what it can be found by. */
  details(kind: TmdbKind, id: number, language: string): Promise<TmdbDetails> {
    const short = language.slice(0, 2);
    return this.get<TmdbDetails>(`/${kind}/${id}`, {
      language,
      append_to_response:
        kind === 'movie'
          ? 'release_dates,images,credits,keywords,external_ids'
          : 'content_ratings,images,aggregate_credits,keywords,external_ids',
      // Logos in the wanted language, in English, and without words.
      include_image_language: [...new Set([short, 'en', 'null'])].join(','),
    });
  }

  season(id: number, seasonNumber: number, language: string): Promise<TmdbSeason> {
    return this.get<TmdbSeason>(`/tv/${id}/season/${seasonNumber}`, { language });
  }

  /** Address of a picture at TMDB in one of its sizes, such as "w342" or "original". */
  imageUrl(size: string, path: string): string {
    return `${this.setup().imageUrl}/${size}${path}`;
  }

  /**
   * Downloads a picture, up to a size limit.
   *
   * @returns null when TMDB does not have it or it is larger than the limit.
   */
  async downloadImage(size: string, path: string, maxBytes: number): Promise<Buffer | null> {
    let response: Response;
    try {
      response = await fetch(this.imageUrl(size, path), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error',
      });
    } catch {
      return null;
    }
    if (!response.ok || !response.body) {
      return null;
    }
    if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
      await response.body.cancel();
      return null;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for await (const chunk of response.body) {
        total += chunk.byteLength;
        if (total > maxBytes) {
          return null;
        }
        chunks.push(chunk);
      }
    } catch {
      return null;
    }
    return Buffer.concat(chunks);
  }

  private setup(): NonNullable<AppConfig['tmdb']> {
    if (!this.config.tmdb) {
      throw new ServiceUnavailableException(
        'The import is not set up. Set TMDB_API_TOKEN to turn it on.',
      );
    }
    return this.config.tmdb;
  }

  private async get<Result>(
    path: string,
    params: Record<string, string>,
    retried = false,
  ): Promise<Result> {
    const { token, apiUrl } = this.setup();
    const url = new URL(`${apiUrl}${path}`);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (API_KEY_PATTERN.test(token)) {
      url.searchParams.set('api_key', token);
    } else {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new BadGatewayException('TMDB could not be reached. Try again in a moment.');
    }

    if (response.status === 429 && !retried) {
      const seconds = Number(response.headers.get('retry-after') ?? 1);
      const wait = Math.min(Math.max(seconds, 0.5) * 1000, MAX_RETRY_WAIT_MS);
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, wait));
      return this.get<Result>(path, params, true);
    }
    if (response.status === 401 || response.status === 403) {
      throw new BadGatewayException('TMDB did not accept the access token. Check TMDB_API_TOKEN.');
    }
    if (response.status === 404) {
      throw new NotFoundException('TMDB has no such title');
    }
    if (response.status === 429) {
      throw new ServiceUnavailableException('TMDB is busy. Try again in a moment.');
    }
    if (!response.ok) {
      throw new BadGatewayException(`TMDB answered with an error (${response.status})`);
    }
    try {
      return (await response.json()) as Result;
    } catch {
      throw new BadGatewayException('TMDB sent an answer that could not be read');
    }
  }
}
