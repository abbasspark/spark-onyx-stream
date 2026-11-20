// SPDX-License-Identifier: AGPL-3.0-only
import { ApiError, apiUrl, configureApiClient, request, toQueryString } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('toQueryString', () => {
  it('leaves out empty values', () => {
    expect(toQueryString({ page: 2, q: '', status: undefined, pageSize: 25 })).toBe(
      '?page=2&pageSize=25',
    );
    expect(toQueryString({})).toBe('');
    expect(toQueryString({ q: 'a b&c' })).toBe('?q=a+b%26c');
  });
});

describe('apiUrl', () => {
  it('keeps full addresses and completes paths', () => {
    expect(apiUrl('https://cdn.example.com/x.m3u8')).toBe('https://cdn.example.com/x.m3u8');
    expect(apiUrl('/v1/media/a/b/hls/master.m3u8')).toBe('/v1/media/a/b/hls/master.m3u8');
  });
});

describe('request', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const onUnauthorized = vi.fn();
  let token: string | null = 'onyx_sess_test';

  beforeEach(() => {
    token = 'onyx_sess_test';
    fetchMock.mockReset();
    onUnauthorized.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    configureApiClient({ token: () => token, onUnauthorized });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends the token and JSON body and parses the answer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: '1' }));

    const result = await request<{ id: string }>('/v1/assets', {
      method: 'POST',
      body: { title: 'Film' },
    });

    expect(result).toEqual({ id: '1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/assets');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"title":"Film"}');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer onyx_sess_test',
      'Content-Type': 'application/json',
    });
  });

  it('returns nothing for an answer without content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(request('/v1/assets/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('turns validation errors into one message with the fields', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        message: 'Validation failed',
        issues: [
          { field: 'email', message: 'Enter a valid email address' },
          { field: 'password', message: 'Password must be at least 12 characters' },
        ],
      }),
    );

    const error = await request('/v1/auth/setup', { method: 'POST', body: {} }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).message).toBe(
      'Enter a valid email address. Password must be at least 12 characters',
    );
    expect((error as ApiError).issues).toHaveLength(2);
  });

  it('ends the session when a token is refused', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Session expired' }));

    await expect(request('/v1/assets')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not end a session on a failed sign-in', async () => {
    token = null;
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Wrong email or password' }));

    await expect(request('/v1/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      message: 'Wrong email or password',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('explains an unreachable server and survives a non-JSON error page', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(request('/v1/assets')).rejects.toThrow(/cannot be reached/);

    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(request('/v1/assets')).rejects.toThrow('The server answered with status 502');
  });
});
