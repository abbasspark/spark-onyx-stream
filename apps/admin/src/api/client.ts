// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Origin of the API. Empty means the origin the panel itself is served from,
 * which is the normal setup: a proxy passes /v1 on to the API.
 */
export const API_ORIGIN: string = (import.meta.env?.VITE_API_URL ?? '').replace(/\/$/, '');

/** Turns a path the API returned, such as a playback URL, into a full address. */
export function apiUrl(pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${API_ORIGIN}${pathOrUrl}`;
}

/** An error answer from the API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Per-field messages of a validation error. */
    readonly issues: readonly { field: string; message: string }[] = [],
    /** What went wrong, as a word a program can act on, such as "two_factor_required". */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenSource = () => string | null;
type UnauthorizedHandler = () => void;

let readToken: TokenSource = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};

/** Connects the client to the session: where the token comes from and what to do when it is refused. */
export function configureApiClient(options: {
  token: TokenSource;
  onUnauthorized: UnauthorizedHandler;
}): void {
  readToken = options.token;
  onUnauthorized = options.onUnauthorized;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Sent as JSON. */
  body?: unknown;
  /** Query parameters. Empty and undefined values are left out. */
  query?: Record<string, string | number | undefined | null>;
  signal?: AbortSignal;
}

/** Builds the query part of an address, leaving out empty values. */
export function toQueryString(query: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Reads the message of an error answer, whatever shape it has. */
export async function toApiError(response: Response): Promise<ApiError> {
  let message = `The server answered with status ${response.status}`;
  let issues: { field: string; message: string }[] = [];
  let code: string | null = null;

  try {
    const body = (await response.json()) as {
      code?: unknown;
      message?: string | string[];
      issues?: { field: string; message: string }[];
    };
    code = typeof body.code === 'string' ? body.code : null;
    if (Array.isArray(body.issues) && body.issues.length > 0) {
      issues = body.issues;
      message = body.issues.map((issue) => issue.message).join('. ');
    } else if (Array.isArray(body.message)) {
      message = body.message.join('. ');
    } else if (typeof body.message === 'string' && body.message) {
      message = body.message;
    }
  } catch {
    // Not JSON, for example an error page of a proxy. The status message stands.
  }

  return new ApiError(response.status, message, issues, code);
}

/**
 * Calls the API and returns the parsed answer.
 *
 * @throws ApiError when the server refuses the request.
 * @throws Error when the server cannot be reached.
 */
export async function request<Result>(path: string, options: RequestOptions = {}): Promise<Result> {
  const token = readToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}${toQueryString(options.query)}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new Error('The server cannot be reached. Check that the API is running', {
      cause: error,
    });
  }

  if (!response.ok) {
    // A refused token on any call other than signing in means the session ended.
    if (response.status === 401 && token) {
      onUnauthorized();
    }
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as Result;
  }
  return (await response.json()) as Result;
}

/**
 * Fetches a file the API builds, such as an export, with the session's token.
 *
 * @returns The file and the name the API gave it.
 * @throws ApiError when the server refuses the request.
 */
export async function download(
  path: string,
  query?: RequestOptions['query'],
): Promise<{ blob: Blob; fileName: string | null }> {
  const token = readToken();
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}${toQueryString(query)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (error) {
    throw new Error('The server cannot be reached. Check that the API is running', {
      cause: error,
    });
  }
  if (!response.ok) {
    if (response.status === 401 && token) {
      onUnauthorized();
    }
    throw await toApiError(response);
  }
  const named = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '');
  return { blob: await response.blob(), fileName: named?.[1] ?? null };
}

/**
 * Sends a file as the body of a request and returns the parsed answer.
 * Used for pictures, which the API takes as the raw file and not as a form.
 *
 * @throws ApiError when the server refuses the upload.
 */
export async function uploadFile<Result>(path: string, file: Blob): Promise<Result> {
  const token = readToken();
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        // The server recognizes the format from the content, so one fixed type is enough.
        'Content-Type': 'application/octet-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });
  } catch (error) {
    throw new Error('The server cannot be reached. Check that the API is running', {
      cause: error,
    });
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      onUnauthorized();
    }
    throw await toApiError(response);
  }
  return (await response.json()) as Result;
}

/**
 * Reads a text file from the API, such as the subtitles of a video.
 *
 * @throws ApiError when the server refuses the request.
 */
export async function requestText(path: string, signal?: AbortSignal): Promise<string> {
  const token = readToken();
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new Error('The server cannot be reached. Check that the API is running', {
      cause: error,
    });
  }
  if (!response.ok) {
    if (response.status === 401 && token) {
      onUnauthorized();
    }
    throw await toApiError(response);
  }
  return response.text();
}
