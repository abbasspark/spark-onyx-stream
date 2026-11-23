// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of outgoing webhooks: managing them, what is sent and how
// it is signed, retries and switching off, and the events that are announced.
// A small server on this machine plays the receiver.
//
// Skipped unless TEST_DATABASE_URL is set.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { ApiKeysModule } from '../src/api-keys/api-keys.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { BillingModule } from '../src/billing/billing.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { DISABLED_REASON } from '../src/webhooks/webhook-delivery.service.js';
import { MAX_ATTEMPTS } from '../src/webhooks/webhook-retry.js';
import { WebhookRunner } from '../src/webhooks/webhook-runner.service.js';
import { verifyWebhook } from '../src/webhooks/webhook-signature.js';
import { WebhooksModule, WebhooksSchedulerModule } from '../src/webhooks/webhooks.module.js';
import { createTestApp, OWNER, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

interface Received {
  headers: IncomingMessage['headers'];
  raw: string;
  body: { id: string; event: string; createdAt: string; data: Record<string, unknown> };
}

describe.skipIf(!TEST_DATABASE_URL)('Outgoing webhooks (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let workDirectory: string;
  let receiver: Server;
  let receiverUrl: string;
  let received: Received[];
  /** What the receiver answers with next: a status, or a redirect. */
  let answer: { status: number; body?: string; location?: string };

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const get = (url: string) => http().get(url).set(auth());
  const post = (url: string, body: object = {}) => http().post(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);
  const put = (url: string, body: object) => http().put(url).set(auth()).send(body);

  /** Sends what is due, the way the scheduler does every two seconds. */
  const run = () => testApp.app.get(WebhookRunner).look();
  const events = () => received.map((request) => request.body.event);

  async function createWebhook(events_: string[] = ['*'], url = receiverUrl) {
    const response = await post('/v1/webhooks', {
      name: 'Automation',
      url,
      events: events_,
    }).expect(201);
    return response.body as { id: string; secret: string };
  }
  async function asset(name: string): Promise<string> {
    const response = await post('/v1/assets', { title: name }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: { status: 'READY', manifestPath: `assets/${id}/hls/master.m3u8`, readyAt: new Date() },
    });
    return id;
  }

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-webhooks-'));
    testApp = await createTestApp(
      [
        AssetsModule,
        AdminsModule,
        ApiKeysModule,
        CatalogModule,
        ViewersModule,
        BillingModule,
        WebhooksModule,
        WebhooksSchedulerModule,
      ],
      {
        STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
        UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      },
    );
    receiver = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        received.push({ headers: request.headers, raw, body: JSON.parse(raw) });
        if (answer.location) {
          response.writeHead(answer.status, { Location: answer.location }).end();
        } else {
          response.writeHead(answer.status).end(answer.body ?? 'ok');
        }
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hooks/onyx`;
  });
  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
    received = [];
    answer = { status: 200 };
  });
  afterAll(async () => {
    await new Promise((resolve) => receiver.close(resolve));
    await testApp?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  describe('managing', () => {
    it('shows the secret once, and never again', async () => {
      const created = await post('/v1/webhooks', {
        name: ' Automation ',
        url: receiverUrl,
        events: ['title.published', 'title.published', 'viewer.created'],
      }).expect(201);
      expect(created.body).toMatchObject({
        name: 'Automation',
        url: receiverUrl,
        events: ['title.published', 'viewer.created'],
        isActive: true,
        failingSince: null,
        lastDelivery: null,
        recent: { delivered: 0, failed: 0, pending: 0 },
      });
      expect(created.body.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);

      const list = await get('/v1/webhooks').expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).not.toHaveProperty('secret');
      const stored = await testApp.prisma.webhook.findFirstOrThrow();
      expect(stored.secret).not.toContain(created.body.secret);
      expect(stored.secret).toMatch(/^v1\./);

      const entry = await testApp.prisma.auditLog.findFirst({
        where: { action: 'webhook.create' },
      });
      expect(JSON.stringify(entry?.metadata)).not.toContain('whsec_');
    });

    it('explains the events with an example each', async () => {
      const reference = await get('/v1/webhooks/reference').expect(200);
      const names = reference.body.events.map((event: { name: string }) => event.name);
      expect(names).toContain('title.published');
      expect(names).toContain('payment.received');
      expect(reference.body.events[0]).toMatchObject({
        group: 'Catalog',
        sample: { title: { name: 'Harbour Lights' } },
      });
      expect(reference.body).toMatchObject({
        retryDelaysSeconds: [60, 300, 1800, 7200, 21600, 43200],
        signatureToleranceSeconds: 300,
        targets: 'any',
      });
    });

    it('refuses addresses and events it cannot use', async () => {
      const body = { name: 'X', events: ['*'] };
      for (const url of [
        'example.com/hook',
        'ftp://example.com/hook',
        'https://user:pw@example.com/hook',
        'http://169.254.169.254/latest/meta-data/',
      ]) {
        await post('/v1/webhooks', { ...body, url }).expect(422);
      }
      await post('/v1/webhooks', { ...body, url: receiverUrl, events: [] }).expect(400);
      const unknown = await post('/v1/webhooks', {
        ...body,
        url: receiverUrl,
        events: ['title.exploded'],
      }).expect(400);
      expect(JSON.stringify(unknown.body)).toContain('title.exploded');
      expect(await testApp.prisma.webhook.count()).toBe(0);
    });

    it('turns "everything" into one entry, and can be changed and deleted', async () => {
      const created = await post('/v1/webhooks', {
        name: 'All',
        url: receiverUrl,
        events: ['title.published', '*'],
      }).expect(201);
      expect(created.body.events).toEqual(['*']);

      const changed = await patch(`/v1/webhooks/${created.body.id}`, {
        name: 'Only titles',
        events: ['title.published'],
      }).expect(200);
      expect(changed.body).toMatchObject({ name: 'Only titles', events: ['title.published'] });
      await patch(`/v1/webhooks/${created.body.id}`, { url: 'nonsense' }).expect(422);

      await http().delete(`/v1/webhooks/${created.body.id}`).set(auth()).expect(204);
      await get(`/v1/webhooks/${created.body.id}`).expect(404);
    });

    it('is for admins who may change settings, and making one is not for API keys', async () => {
      await post('/v1/admins', {
        email: 'editor@example.com',
        displayName: 'Edith Editor',
        password: 'another-long-password',
        role: 'EDITOR',
      }).expect(201);
      const editor = testApp.bearer(
        await testApp.login('editor@example.com', 'another-long-password'),
      );
      await http().get('/v1/webhooks').set(editor).expect(403);
      await http()
        .post('/v1/webhooks')
        .set(editor)
        .send({ name: 'X', url: receiverUrl, events: ['*'] })
        .expect(403);

      const key = await post('/v1/api-keys', {
        name: 'Script',
        scopes: ['settings:read', 'settings:write'],
      }).expect(201);
      const apiKey = testApp.bearer(key.body.key as string);
      await http().get('/v1/webhooks').set(apiKey).expect(200);
      await http()
        .post('/v1/webhooks')
        .set(apiKey)
        .send({ name: 'X', url: receiverUrl, events: ['*'] })
        .expect(403);
    });
  });

  describe('sending', () => {
    it('sends a signed request that the receiver can verify', async () => {
      const webhook = await createWebhook(['title.published']);
      const film = (await post('/v1/titles', { type: 'MOVIE', name: 'Harbour Lights' }).expect(201))
        .body;
      await patch(`/v1/titles/${film.id}`, { assetId: await asset('Film') }).expect(200);
      expect(await run()).toBe(0);

      await put(`/v1/titles/${film.id}/status`, { status: 'PUBLISHED' }).expect(200);
      expect(await run()).toBe(1);

      expect(received).toHaveLength(1);
      const [request] = received as [Received];
      expect(request.headers).toMatchObject({
        'content-type': 'application/json',
        'user-agent': 'Spark-Onyx-Stream-Webhooks/1',
        'x-onyx-event': 'title.published',
        'x-onyx-delivery': request.body.id,
      });
      expect(request.body).toMatchObject({
        event: 'title.published',
        data: {
          title: {
            id: film.id,
            type: 'MOVIE',
            name: 'Harbour Lights',
            slug: 'harbour-lights',
            status: 'PUBLISHED',
          },
        },
      });
      expect(new Date(request.body.createdAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

      const timestamp = Number(request.headers['x-onyx-timestamp']);
      const signature = request.headers['x-onyx-signature'] as string;
      expect(verifyWebhook(webhook.secret, timestamp, request.raw, signature)).toBe(true);
      expect(verifyWebhook('whsec_wrong', timestamp, request.raw, signature)).toBe(false);

      const deliveries = await get(`/v1/webhooks/${webhook.id}/deliveries`).expect(200);
      expect(deliveries.body.items).toMatchObject([
        {
          id: request.body.id,
          event: 'title.published',
          status: 'DELIVERED',
          attempts: 1,
          maxAttempts: MAX_ATTEMPTS,
          responseStatus: 200,
          error: null,
          nextAttemptAt: null,
        },
      ]);
      const detail = await get(`/v1/webhooks/${webhook.id}/deliveries/${request.body.id}`).expect(
        200,
      );
      expect(detail.body.payload).toEqual(request.body);
      expect(detail.body.responseBody).toBe('ok');

      const activity = (await get(`/v1/webhooks/${webhook.id}/activity`).expect(200)).body;
      expect(activity).toHaveLength(24);
      expect(activity[23]).toMatchObject({ delivered: 1, failed: 0, pending: 0 });
      expect(activity[22]).toMatchObject({ delivered: 0, failed: 0, pending: 0 });
      expect(new Date(activity[23].start).getTime()).toBeLessThanOrEqual(Date.now());

      const view = await get(`/v1/webhooks/${webhook.id}`).expect(200);
      expect(view.body).toMatchObject({
        lastDelivery: { status: 'DELIVERED', event: 'title.published' },
        recent: { delivered: 1, failed: 0, pending: 0 },
      });
    });

    it('signs with the new secret after it is replaced', async () => {
      const webhook = await createWebhook(['viewer.created']);
      const rolled = await post(`/v1/webhooks/${webhook.id}/secret`).expect(200);
      expect(rolled.body.secret).not.toBe(webhook.secret);

      await post('/v1/viewers', {
        email: 'lena@example.com',
        displayName: 'Lena',
        password: 'a-long-password-1',
      }).expect(201);
      await run();
      const [request] = received as [Received];
      const timestamp = Number(request.headers['x-onyx-timestamp']);
      const signature = request.headers['x-onyx-signature'] as string;
      expect(verifyWebhook(rolled.body.secret, timestamp, request.raw, signature)).toBe(true);
      expect(verifyWebhook(webhook.secret, timestamp, request.raw, signature)).toBe(false);
    });

    it('tries again later after a failure, with the same id, and remembers since when it fails', async () => {
      const webhook = await createWebhook(['viewer.created']);
      answer = { status: 503, body: 'down for maintenance' };
      await post('/v1/viewers', {
        email: 'lena@example.com',
        displayName: 'Lena',
        password: 'a-long-password-1',
      }).expect(201);
      await run();

      let deliveries = (await get(`/v1/webhooks/${webhook.id}/deliveries`).expect(200)).body.items;
      expect(deliveries).toMatchObject([
        { status: 'PENDING', attempts: 1, responseStatus: 503, deliveredAt: null },
      ]);
      const wait = new Date(deliveries[0].nextAttemptAt).getTime() - Date.now();
      expect(wait).toBeGreaterThan(50_000);
      expect(wait).toBeLessThan(61_000);
      expect(
        (await get(`/v1/webhooks/${webhook.id}`).expect(200)).body.failingSince,
      ).not.toBeNull();
      // Not due yet.
      expect(await run()).toBe(0);

      // A minute later the receiver is back.
      answer = { status: 204 };
      await testApp.prisma.webhookDelivery.updateMany({ data: { nextAttemptAt: new Date() } });
      expect(await run()).toBe(1);
      deliveries = (await get(`/v1/webhooks/${webhook.id}/deliveries`).expect(200)).body.items;
      expect(deliveries).toMatchObject([{ status: 'DELIVERED', attempts: 2, responseStatus: 204 }]);
      expect(received.map((request) => request.body.id)).toEqual([
        deliveries[0].id,
        deliveries[0].id,
      ]);
      expect((await get(`/v1/webhooks/${webhook.id}`).expect(200)).body.failingSince).toBeNull();
    });

    it('gives up after the last try', async () => {
      const webhook = await createWebhook(['viewer.created']);
      answer = { status: 500 };
      await post('/v1/viewers', {
        email: 'lena@example.com',
        displayName: 'Lena',
        password: 'a-long-password-1',
      }).expect(201);
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        await testApp.prisma.webhookDelivery.updateMany({
          where: { status: 'PENDING' },
          data: { nextAttemptAt: new Date() },
        });
        await run();
      }
      const deliveries = (
        await get(`/v1/webhooks/${webhook.id}/deliveries?status=FAILED`).expect(200)
      ).body.items;
      expect(deliveries).toMatchObject([
        { status: 'FAILED', attempts: MAX_ATTEMPTS, nextAttemptAt: null },
      ]);
      expect(received).toHaveLength(MAX_ATTEMPTS);
      expect(await run()).toBe(0);
    });

    it('does not follow a redirect, and says when nothing listens', async () => {
      const webhook = await createWebhook(['viewer.created']);
      answer = { status: 302, location: 'http://127.0.0.1:1/elsewhere' };
      await post('/v1/viewers', {
        email: 'lena@example.com',
        displayName: 'Lena',
        password: 'a-long-password-1',
      }).expect(201);
      await run();
      const first = (await get(`/v1/webhooks/${webhook.id}/deliveries`).expect(200)).body.items[0];
      expect(first).toMatchObject({ status: 'PENDING', responseStatus: 302 });
      expect(first.error).toMatch(/redirect/);
      expect(received).toHaveLength(1);

      // A port that was free a moment ago has nothing listening.
      const closed = createServer();
      await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
      const port = (closed.address() as AddressInfo).port;
      await new Promise((resolve) => closed.close(resolve));
      const dead = await createWebhook(['*'], `http://127.0.0.1:${port}/hook`);
      const test = await post(`/v1/webhooks/${dead.id}/test`).expect(200);
      expect(test.body).toMatchObject({ status: 'FAILED', responseStatus: null, attempts: 1 });
      expect(test.body.error).toMatch(/refused/);
    });

    it('switches a webhook off after three days of failures, and starts clean when switched on', async () => {
      const webhook = await createWebhook(['viewer.created']);
      answer = { status: 500 };
      const signUp = (email: string) =>
        post('/v1/viewers', { email, displayName: 'V', password: 'a-long-password-1' }).expect(201);
      await signUp('one@example.com');
      await run();
      // It has been failing for more than three days when the next one fails.
      await testApp.prisma.webhook.update({
        where: { id: webhook.id },
        data: { failingSince: new Date(Date.now() - 73 * 60 * 60 * 1000) },
      });
      await signUp('two@example.com');
      await run();

      const off = (await get(`/v1/webhooks/${webhook.id}`).expect(200)).body;
      expect(off).toMatchObject({ isActive: false, disabledReason: DISABLED_REASON });
      const waiting = await testApp.prisma.webhookDelivery.count({ where: { status: 'PENDING' } });
      expect(waiting).toBe(0);

      // Nothing is queued for it while it is off.
      await signUp('three@example.com');
      expect(await testApp.prisma.webhookDelivery.count()).toBe(2);

      const on = await patch(`/v1/webhooks/${webhook.id}`, { isActive: true }).expect(200);
      expect(on.body).toMatchObject({ isActive: true, disabledReason: null, failingSince: null });
    });

    it('sends a test at once, whatever the webhook listens to, without retries', async () => {
      const webhook = await createWebhook(['title.published']);
      const ok = await post(`/v1/webhooks/${webhook.id}/test`).expect(200);
      expect(ok.body).toMatchObject({
        event: 'webhook.test',
        status: 'DELIVERED',
        attempts: 1,
        maxAttempts: 1,
        responseStatus: 200,
        responseBody: 'ok',
      });
      expect(ok.body.payload.data).toMatchObject({
        webhook: { id: webhook.id, name: 'Automation' },
        sentBy: OWNER.displayName,
      });
      expect(events()).toEqual(['webhook.test']);

      answer = { status: 401, body: 'bad signature' };
      const refused = await post(`/v1/webhooks/${webhook.id}/test`).expect(200);
      expect(refused.body).toMatchObject({
        status: 'FAILED',
        responseStatus: 401,
        responseBody: 'bad signature',
        nextAttemptAt: null,
      });
      // A failed test says nothing about the health of the webhook.
      expect((await get(`/v1/webhooks/${webhook.id}`).expect(200)).body.failingSince).toBeNull();
      expect(await run()).toBe(0);
    });

    it('sends a delivery again as a new one', async () => {
      const webhook = await createWebhook(['viewer.created']);
      await post('/v1/viewers', {
        email: 'lena@example.com',
        displayName: 'Lena',
        password: 'a-long-password-1',
      }).expect(201);
      await run();
      const first = (await get(`/v1/webhooks/${webhook.id}/deliveries`).expect(200)).body.items[0];

      const again = await post(
        `/v1/webhooks/${webhook.id}/deliveries/${first.id}/redeliver`,
      ).expect(200);
      expect(again.body).toMatchObject({ event: 'viewer.created', status: 'PENDING', attempts: 0 });
      expect(again.body.id).not.toBe(first.id);
      await run();
      expect(received.map((request) => request.body.data)).toEqual([
        received[0]?.body.data,
        received[0]?.body.data,
      ]);

      await patch(`/v1/webhooks/${webhook.id}`, { isActive: false }).expect(200);
      await post(`/v1/webhooks/${webhook.id}/deliveries/${first.id}/redeliver`).expect(409);
    });

    it('clears out deliveries that are over and older than a month', async () => {
      const webhook = await createWebhook();
      const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      await testApp.prisma.webhookDelivery.createMany({
        data: [
          {
            webhookId: webhook.id,
            event: 'viewer.created',
            data: {},
            status: 'DELIVERED',
            createdAt: old,
          },
          {
            webhookId: webhook.id,
            event: 'viewer.created',
            data: {},
            status: 'PENDING',
            createdAt: old,
          },
          { webhookId: webhook.id, event: 'viewer.created', data: {}, status: 'FAILED' },
        ],
      });
      expect(await testApp.app.get(WebhookRunner).prune()).toBe(1);
      expect(await testApp.prisma.webhookDelivery.count()).toBe(2);
    });
  });

  describe('what is announced', () => {
    it('follows a title from draft to deleted', async () => {
      await createWebhook();
      const film = (await post('/v1/titles', { type: 'MOVIE', name: 'Harbour Lights' }).expect(201))
        .body;
      await patch(`/v1/titles/${film.id}`, {
        assetId: await asset('Film'),
        synopsis: 'A port town in winter.',
      }).expect(200);
      await put(`/v1/titles/${film.id}/status`, { status: 'PUBLISHED' }).expect(200);
      await put(`/v1/titles/${film.id}/status`, { status: 'DRAFT' }).expect(200);
      await http().delete(`/v1/titles/${film.id}`).set(auth()).expect(204);
      await run();

      expect(events()).toEqual([
        'title.updated',
        'title.published',
        'title.unpublished',
        'title.deleted',
      ]);
      expect(received[0]?.body.data).toMatchObject({
        title: { id: film.id, status: 'DRAFT' },
        action: 'update',
        changed: ['Synopsis', 'Video'],
      });
      expect(received[3]?.body.data).toEqual({
        title: { id: film.id, type: 'MOVIE', name: 'Harbour Lights', slug: 'harbour-lights' },
      });
    });

    it('follows viewers, subscriptions, purchases and payments', async () => {
      await createWebhook();
      const film = (await post('/v1/titles', { type: 'MOVIE', name: 'Night Train' }).expect(201))
        .body;

      const signedUp = await http()
        .post('/v1/viewer/register')
        .send({ email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' })
        .expect(201);
      const viewerId = signedUp.body.viewer.id as string;
      const plan = await post('/v1/plans', { name: 'Everything', monthlyAmount: 799 }).expect(201);
      const subscription = await post(`/v1/viewers/${viewerId}/subscriptions`, {
        planId: plan.body.id,
        endsAt: null,
      }).expect(201);
      await post(`/v1/subscriptions/${subscription.body.id}/end`).expect(200);
      await post(`/v1/viewers/${viewerId}/purchases`, {
        titleId: film.id,
        kind: 'BUY',
        amount: 1299,
      }).expect(201);
      await run();

      // The title was only made, which announces nothing.
      expect(events()).toEqual([
        'viewer.created',
        'subscription.started',
        'subscription.ended',
        'purchase.completed',
        'payment.received',
      ]);
      const viewer = { id: viewerId, email: 'anna@example.com' };
      expect(received[0]?.body.data).toEqual({
        viewer: { ...viewer, displayName: 'Anna' },
        by: 'signup',
      });
      expect(received[1]?.body.data).toEqual({
        subscription: {
          id: subscription.body.id,
          status: 'ACTIVE',
          source: 'MANUAL',
          plan: { id: plan.body.id, name: 'Everything' },
        },
        viewer,
      });
      expect(received[2]?.body.data).toMatchObject({ subscription: { status: 'CANCELED' } });
      expect(received[3]?.body.data).toMatchObject({
        purchase: { kind: 'BUY', source: 'MANUAL' },
        title: { id: film.id, name: 'Night Train' },
        viewer,
      });
      expect(received[4]?.body.data).toMatchObject({
        payment: { amount: 1299, source: 'MANUAL', kind: 'PURCHASE' },
        viewer,
      });
    });

    it('tells each webhook only what it asked for', async () => {
      const titles = await createWebhook(['title.deleted']);
      const viewers = await createWebhook(['viewer.created']);
      await post('/v1/viewers', {
        email: 'lena@example.com',
        displayName: 'Lena',
        password: 'a-long-password-1',
      }).expect(201);
      await run();
      expect(events()).toEqual(['viewer.created']);
      expect((await get(`/v1/webhooks/${titles.id}/deliveries`).expect(200)).body.total).toBe(0);
      expect((await get(`/v1/webhooks/${viewers.id}/deliveries`).expect(200)).body.total).toBe(1);
    });
  });
});
