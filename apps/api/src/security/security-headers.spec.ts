// SPDX-License-Identifier: AGPL-3.0-only
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { securityHeaders } from './security-headers.js';

@Controller('ping')
class PingController {
  @Get()
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

let nest: INestApplication<App> | undefined;

afterEach(async () => {
  await nest?.close();
  nest = undefined;
});

/** A small application with the headers switched on, built the way main.ts builds the real one. */
async function app(): Promise<App> {
  const moduleRef = await Test.createTestingModule({ controllers: [PingController] }).compile();
  nest = moduleRef.createNestApplication<INestApplication<App>>();
  nest.use(securityHeaders());
  await nest.init();
  return nest.getHttpServer();
}

describe('securityHeaders', () => {
  it('forbids loading anything from a response and framing it', async () => {
    const response = await request(await app()).get('/ping');
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
  });

  it('keeps responses readable from other sites, for players and pages elsewhere', async () => {
    const response = await request(await app()).get('/ping');
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('turns MIME sniffing off, hides the framework and sends no referrer', async () => {
    const response = await request(await app()).get('/ping');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  it('asks for HTTPS for six months and leaves subdomains alone', async () => {
    const response = await request(await app()).get('/ping');
    expect(response.headers['strict-transport-security']).toBe('max-age=15552000');
  });

  it('does not touch the body', async () => {
    const response = await request(await app()).get('/ping');
    expect(response.body).toEqual({ ok: true });
  });
});
