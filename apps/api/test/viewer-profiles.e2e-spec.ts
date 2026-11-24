// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of profiles: the people who share a viewer account, each
// with their own watch history.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { WatchingModule } from '../src/watching/watching.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [AssetsModule, AdminsModule, CatalogModule, ViewersModule, WatchingModule];
const ANNA = { email: 'anna@example.com', displayName: 'Anna Berg', password: 'correct-horse' };
const BEN = { email: 'ben@example.com', displayName: 'Ben', password: 'battery-staple' };

interface Profile {
  id: string;
  name: string;
  color: string;
  isMain: boolean;
}

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Viewer profiles (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;

  const http = () => testApp.http();

  async function register(viewer = ANNA) {
    const response = await http().post('/v1/viewer/register').send(viewer).expect(201);
    return {
      id: response.body.viewer.id as string,
      profile: response.body.profile as Profile,
      cookie: cookieOf(response),
    };
  }

  const signIn = async (viewer = ANNA) =>
    cookieOf(
      await http()
        .post('/v1/viewer/login')
        .send({ email: viewer.email, password: viewer.password })
        .expect(200),
    );

  const list = async (cookie: string) =>
    (await http().get('/v1/viewer/profiles').set('Cookie', cookie).expect(200)).body as {
      profiles: Profile[];
      currentId: string;
      limit: number;
      colors: string[];
    };

  const add = (cookie: string, body: Record<string, unknown>) =>
    http().post('/v1/viewer/profiles').set('Cookie', cookie).send(body);

  const select = (cookie: string, id: string) =>
    http().post(`/v1/viewer/profiles/${id}/select`).set('Cookie', cookie);

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-profiles-'));
    testApp = await createTestApp(MODULES, {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
    });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.resetDatabase();
    await testApp.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  it('gives every account a main profile named like the account', async () => {
    const { profile, cookie } = await register();
    expect(profile).toEqual({
      id: expect.any(String),
      name: 'Anna Berg',
      color: 'amber',
      isMain: true,
      isKids: false,
      maxAge: null,
      locked: false,
      audioLanguage: null,
      subtitleLanguage: null,
    });

    const profiles = await list(cookie);
    expect(profiles).toEqual({
      profiles: [profile],
      currentId: profile.id,
      limit: 5,
      colors: ['amber', 'coral', 'rose', 'violet', 'blue', 'teal', 'green', 'slate'],
    });

    const session = await http().get('/v1/viewer/session').set('Cookie', cookie).expect(200);
    expect(session.body.profile).toEqual(profile);
    // Signing in again finds the same one.
    const again = await http()
      .post('/v1/viewer/login')
      .send({ email: ANNA.email, password: ANNA.password })
      .expect(200);
    expect(again.body.profile).toEqual(profile);
  });

  it('makes the main profile once, however many requests arrive together', async () => {
    const ownerToken = await testApp.setupOwner();
    const created = await http()
      .post('/v1/viewers')
      .set(testApp.bearer(ownerToken))
      .send(BEN)
      .expect(201);
    const cookie = await signIn(BEN);
    await testApp.prisma.viewerProfile.deleteMany({ where: { viewerId: created.body.id } });

    await Promise.all(Array.from({ length: 6 }, () => list(cookie)));
    const profiles = await testApp.prisma.viewerProfile.findMany({
      where: { viewerId: created.body.id },
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ name: 'Ben', isMain: true });
  });

  it('adds profiles, each with a colour of its own, up to the limit', async () => {
    const { cookie } = await register();
    const kids = await add(cookie, { name: '  Kids   room ' }).expect(201);
    expect(kids.body).toEqual({
      id: expect.any(String),
      name: 'Kids room',
      color: 'coral',
      isMain: false,
      isKids: false,
      maxAge: null,
      locked: false,
      audioLanguage: null,
      subtitleLanguage: null,
    });
    const picked = await add(cookie, { name: 'Sam', color: 'teal' }).expect(201);
    expect(picked.body.color).toBe('teal');
    expect((await add(cookie, { name: 'Lea' }).expect(201)).body.color).toBe('rose');
    await add(cookie, { name: 'Guest' }).expect(201);

    const full = await add(cookie, { name: 'One too many' }).expect(409);
    expect(full.body.message).toBe('An account can have 5 profiles');
    expect((await list(cookie)).profiles.map((profile) => profile.name)).toEqual([
      'Anna Berg',
      'Kids room',
      'Sam',
      'Lea',
      'Guest',
    ]);
  });

  it('remembers the languages a profile likes to hear and to read', async () => {
    const { cookie, profile } = await register();
    const preferences = () => http().get('/v1/viewer/preferences').set('Cookie', cookie);
    const change = (body: object) =>
      http().patch('/v1/viewer/preferences').set('Cookie', cookie).send(body);
    await http().get('/v1/viewer/preferences').expect(401);

    expect((await preferences().expect(200)).body).toEqual({
      audioLanguage: null,
      subtitleLanguage: null,
    });
    // What a player sends when the viewer picks a language in its menu.
    expect((await change({ audioLanguage: 'DE' }).expect(200)).body).toEqual({
      audioLanguage: 'de',
      subtitleLanguage: null,
    });
    expect((await change({ subtitleLanguage: 'pt-br' }).expect(200)).body).toEqual({
      audioLanguage: 'de',
      subtitleLanguage: 'pt-BR',
    });
    await change({ audioLanguage: 'german' }).expect(400);
    await change({}).expect(400);

    // They belong to the profile in use, and the sign-in says them.
    const sam = await add(cookie, { name: 'Sam', subtitleLanguage: 'fr' }).expect(201);
    expect(sam.body).toMatchObject({ audioLanguage: null, subtitleLanguage: 'fr' });
    await select(cookie, sam.body.id).expect(200);
    expect((await preferences().expect(200)).body.subtitleLanguage).toBe('fr');
    await change({ subtitleLanguage: null }).expect(200);
    const session = await http().get('/v1/viewer/session').set('Cookie', cookie).expect(200);
    expect(session.body.profile).toMatchObject({ id: sam.body.id, subtitleLanguage: null });

    const all = await list(cookie);
    expect(all.profiles.find((item) => item.id === profile.id)).toMatchObject({
      audioLanguage: 'de',
      subtitleLanguage: 'pt-BR',
    });
  });

  it('checks names and colours', async () => {
    const { profile, cookie } = await register();
    await add(cookie, {}).expect(400);
    await add(cookie, { name: '   ' }).expect(400);
    await add(cookie, { name: 'x'.repeat(41) }).expect(400);
    await add(cookie, { name: 'Sam', color: 'neon' }).expect(400);

    // A name that differs only in capital letters is the same name.
    const taken = await add(cookie, { name: 'anna berg' }).expect(409);
    expect(taken.body.message).toBe('Another profile has this name');

    const sam = await add(cookie, { name: 'Sam' }).expect(201);
    const patch = (id: string, body: Record<string, unknown>) =>
      http().patch(`/v1/viewer/profiles/${id}`).set('Cookie', cookie).send(body);
    await patch(sam.body.id, {}).expect(400);
    await patch(sam.body.id, { name: 'Anna Berg' }).expect(409);
    // Changing only the capital letters of the own name is fine.
    expect((await patch(sam.body.id, { name: 'SAM' }).expect(200)).body.name).toBe('SAM');
    expect((await patch(profile.id, { name: 'Anna', color: 'violet' }).expect(200)).body).toEqual({
      id: profile.id,
      name: 'Anna',
      color: 'violet',
      isMain: true,
      isKids: false,
      maxAge: null,
      locked: false,
      audioLanguage: null,
      subtitleLanguage: null,
    });
    await patch('00000000-0000-7000-8000-000000000000', { name: 'Nobody' }).expect(404);
  });

  it('keeps the choice of profile per device', async () => {
    const { profile, cookie: laptop } = await register();
    const sam = (await add(laptop, { name: 'Sam' }).expect(201)).body as Profile;
    const phone = await signIn();

    const chosen = await select(phone, sam.id).expect(200);
    expect(chosen.body).toEqual(sam);
    expect(chosen.headers['cache-control']).toBe('no-store');

    expect((await list(phone)).currentId).toBe(sam.id);
    expect((await list(laptop)).currentId).toBe(profile.id);
    const session = await http().get('/v1/viewer/session').set('Cookie', phone).expect(200);
    expect(session.body.profile).toEqual(sam);
  });

  it('belongs to one account only', async () => {
    const anna = await register();
    const ben = await register(BEN);
    const sam = (await add(anna.cookie, { name: 'Sam' }).expect(201)).body as Profile;

    await select(ben.cookie, sam.id).expect(404);
    await http()
      .patch(`/v1/viewer/profiles/${sam.id}`)
      .set('Cookie', ben.cookie)
      .send({ name: 'Mine now' })
      .expect(404);
    await http().delete(`/v1/viewer/profiles/${sam.id}`).set('Cookie', ben.cookie).expect(404);
    expect((await list(ben.cookie)).profiles).toHaveLength(1);
    expect((await list(anna.cookie)).profiles).toHaveLength(2);
  });

  it('is only for signed-in viewers of this site', async () => {
    const { profile, cookie } = await register();
    await http().get('/v1/viewer/profiles').expect(401);
    await http().post('/v1/viewer/profiles').send({ name: 'Sam' }).expect(401);
    await add(cookie, { name: 'Sam' }).set('Origin', 'https://evil.example').expect(403);
    await select(cookie, profile.id).set('Origin', 'https://evil.example').expect(403);
  });

  describe('watch history', () => {
    async function createMovie(ownerToken: string, name: string) {
      const admin = testApp.bearer(ownerToken);
      const created = await http()
        .post('/v1/titles')
        .set(admin)
        .send({ type: 'MOVIE', name })
        .expect(201);
      const asset = await http()
        .post('/v1/assets')
        .set(admin)
        .send({ title: `${name} master` })
        .expect(201);
      const assetId = asset.body.asset.id as string;
      await testApp.prisma.asset.update({
        where: { id: assetId },
        data: { status: 'READY', manifestPath: `assets/${assetId}/hls/master.m3u8` },
      });
      await http().patch(`/v1/titles/${created.body.id}`).set(admin).send({ assetId }).expect(200);
      await http()
        .put(`/v1/titles/${created.body.id}/status`)
        .set(admin)
        .send({ status: 'PUBLISHED' })
        .expect(200);
      return { id: created.body.id as string, slug: created.body.slug as string };
    }

    const report = (cookie: string, title: string, position: number) =>
      http()
        .put('/v1/viewer/watching')
        .set('Cookie', cookie)
        .send({ items: [{ title, position, duration: 90 }] })
        .expect(200);

    const watching = async (cookie: string) =>
      (
        (await http().get('/v1/viewer/watching').set('Cookie', cookie).expect(200)).body.items as {
          title: { name: string };
          position: number;
        }[]
      ).map((item) => `${item.title.name} ${item.position}`);

    it('is kept apart for each profile, and the same on every device of one', async () => {
      const ownerToken = await testApp.setupOwner();
      const train = await createMovie(ownerToken, 'Night Train');
      const coast = await createMovie(ownerToken, 'Wild Coast');
      const { cookie: laptop } = await register();
      const sam = (await add(laptop, { name: 'Sam' }).expect(201)).body as Profile;
      const phone = await signIn();
      const tablet = await signIn();
      await select(phone, sam.id).expect(200);
      await select(tablet, sam.id).expect(200);

      await report(laptop, train.slug, 40);
      await report(phone, train.slug, 70);
      await report(phone, coast.slug, 30);

      expect(await watching(laptop)).toEqual(['Night Train 40']);
      expect(await watching(tablet)).toEqual(['Wild Coast 30', 'Night Train 70']);

      // Removing and clearing touch the profile in use only.
      await http().delete(`/v1/viewer/watching/${coast.id}`).set('Cookie', laptop).expect(404);
      const cleared = await http().delete('/v1/viewer/watching').set('Cookie', tablet).expect(200);
      expect(cleared.body).toEqual({ removed: 2 });
      expect(await watching(phone)).toEqual([]);
      expect(await watching(laptop)).toEqual(['Night Train 40']);
    });

    it('goes with a deleted profile, and its devices return to the main profile', async () => {
      const ownerToken = await testApp.setupOwner();
      const train = await createMovie(ownerToken, 'Night Train');
      const { id, profile, cookie: laptop } = await register();
      const sam = (await add(laptop, { name: 'Sam' }).expect(201)).body as Profile;
      const phone = await signIn();
      await select(phone, sam.id).expect(200);
      await report(laptop, train.slug, 40);
      await report(phone, train.slug, 70);

      const refused = await http()
        .delete(`/v1/viewer/profiles/${profile.id}`)
        .set('Cookie', laptop)
        .expect(409);
      expect(refused.body.message).toBe(
        'The main profile stays with the account. Rename it, or delete the account.',
      );

      await http().delete(`/v1/viewer/profiles/${sam.id}`).set('Cookie', laptop).expect(204);
      await http().delete(`/v1/viewer/profiles/${sam.id}`).set('Cookie', laptop).expect(404);
      expect(await testApp.prisma.watchProgress.count({ where: { viewerId: id } })).toBe(1);
      // The phone is still signed in, as the main profile now.
      expect((await list(phone)).currentId).toBe(profile.id);
      expect(await watching(phone)).toEqual(['Night Train 40']);
      // The name is free again.
      await add(laptop, { name: 'Sam' }).expect(201);
    });

    it('shows admins who of an account watched', async () => {
      const ownerToken = await testApp.setupOwner();
      const train = await createMovie(ownerToken, 'Night Train');
      const { id, profile, cookie: laptop } = await register();
      const sam = (await add(laptop, { name: 'Sam' }).expect(201)).body as Profile;
      const phone = await signIn();
      await select(phone, sam.id).expect(200);
      await report(laptop, train.slug, 40);
      await report(phone, train.slug, 70);

      const detail = await http()
        .get(`/v1/viewers/${id}`)
        .set(testApp.bearer(ownerToken))
        .expect(200);
      expect(detail.body.profiles).toEqual([profile, sam]);

      const seen = await http()
        .get(`/v1/viewers/${id}/watching`)
        .set(testApp.bearer(ownerToken))
        .expect(200);
      expect(seen.body.total).toBe(2);
      expect(
        seen.body.items
          .map((item: { profile: { name: string }; position: number }) => [
            item.profile.name,
            item.position,
          ])
          .sort(),
      ).toEqual([
        ['Anna Berg', 40],
        ['Sam', 70],
      ]);
    });
  });

  it('goes with the account', async () => {
    const { cookie } = await register();
    await add(cookie, { name: 'Sam' }).expect(201);
    await http()
      .post('/v1/viewer/delete')
      .set('Cookie', cookie)
      .send({ password: ANNA.password })
      .expect(204);
    expect(await testApp.prisma.viewerProfile.count()).toBe(0);
  });
});
