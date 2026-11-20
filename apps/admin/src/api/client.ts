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

  try {
    const body = (await response.json()) as {
      message?: string | string[];
      issues?: { field: string; message: string }[];
    };
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

  return new ApiError(response.status, message, issues);
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
