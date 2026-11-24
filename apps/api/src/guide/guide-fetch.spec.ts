// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGuide } from './guide-import.service.js';
import { XmltvError } from './xmltv.js';

/** Collects what fetch was called with, and answers as told. */
function stubFetch(answers: { status: number; location?: string; body?: string }[]) {
  const calls: string[] = [];
  const stub = vi.fn(async (input: URL | string) => {
    calls.push(String(input));
    const answer = answers[calls.length - 1] ?? { status: 404 };
    const headers = new Headers(answer.location ? { location: answer.location } : {});
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      headers,
      body: answer.status < 300 ? new Response(answer.body ?? '<tv></tv>').body : null,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', stub);
  return calls;
}

const read = async (url: string) => {
  const parts: Uint8Array[] = [];
  for await (const chunk of await fetchGuide(url, new AbortController().signal)) {
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString();
};

describe('fetchGuide', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches a guide and hands it on', async () => {
    const calls = stubFetch([{ status: 200, body: '<tv>hello</tv>' }]);
    expect(await read('http://203.0.113.10/guide.xml')).toBe('<tv>hello</tv>');
    expect(calls).toEqual(['http://203.0.113.10/guide.xml']);
  });

  it('does not call the address a cloud hands out credentials on', async () => {
    const calls = stubFetch([{ status: 200 }]);
    await expect(read('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(XmltvError);
    expect(calls).toEqual([]);
  });

  it('does not let a redirect lead there either', async () => {
    const calls = stubFetch([
      { status: 302, location: 'http://169.254.169.254/latest/meta-data/' },
      { status: 200 },
    ]);
    await expect(read('http://203.0.113.10/guide.xml')).rejects.toThrow(
      /reserved for the machine itself/,
    );
    expect(calls).toEqual(['http://203.0.113.10/guide.xml']);
  });

  it('follows a redirect to an address that may be called', async () => {
    const calls = stubFetch([
      { status: 301, location: 'http://198.51.100.4/real.xml' },
      { status: 200, body: '<tv>moved</tv>' },
    ]);
    expect(await read('http://203.0.113.10/guide.xml')).toBe('<tv>moved</tv>');
    expect(calls).toEqual(['http://203.0.113.10/guide.xml', 'http://198.51.100.4/real.xml']);
  });

  it('allows a guide on the same network, where they often are', async () => {
    const calls = stubFetch([{ status: 200, body: '<tv>local</tv>' }]);
    expect(await read('http://192.168.1.5:9981/xmltv')).toBe('<tv>local</tv>');
    expect(calls).toHaveLength(1);
  });

  it('gives up when the address sends it in circles', async () => {
    stubFetch(
      Array.from({ length: 9 }, () => ({ status: 302, location: 'http://203.0.113.11/x' })),
    );
    await expect(read('http://203.0.113.10/guide.xml')).rejects.toThrow(/in circles/);
  });

  it('refuses an address that is not http', async () => {
    const calls = stubFetch([{ status: 200 }]);
    await expect(read('file:///etc/passwd')).rejects.toThrow(/http or https/);
    expect(calls).toEqual([]);
  });
});
