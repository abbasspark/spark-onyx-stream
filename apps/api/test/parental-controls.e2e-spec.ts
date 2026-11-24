// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of parental controls: the age a title or channel suits
// from, profiles with a limit, PINs on profiles, and what a limited profile
// may and may not do.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { BillingModule } from '../src/billing/billing.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { LiveModule } from '../src/live/live.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [
  AssetsModule,
  AdminsModule,
  CatalogModule,
  ViewersModule,
  BillingModule,
  LiveModule,
];
const ANNA = { email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' };
const SOURCE = 'https://origin.example.com/live/news.m3u8';

interface Profile {
  id: string;
  name: string;
  isMain: boolean;
  isKids: boolean;
  maxAge: number | null;
  locked: boolean;
}

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Parental controls (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function register(viewer = ANNA) {
    const response = await http().post('/v1/viewer/register').send(viewer).expect(201);
    return { id: response.body.viewer.id as string, cookie: cookieOf(response) };
  }

  /** A published film that plays, rated as told. */
  async function createMovie(name: string, rating: Record<string, unknown> = {}) {
    const created = await http()
      .post('/v1/titles')
      .set(admin())
      .send({ type: 'MOVIE', name })
      .expect(201);
    const id = created.body.id as string;
    const asset = await http().post('/v1/assets').set(admin()).send({ title: name }).expect(201);
    const assetId = asset.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: 'READY',
        manifestPath: `assets/${assetId}/hls/master.m3u8`,
        durationMs: 90_000,
      },
    });
    await http()
      .patch(`/v1/titles/${id}`)
      .set(admin())
      .send({ assetId, ...rating })
      .expect(200);
    await http()
      .put(`/v1/titles/${id}/status`)
      .set(admin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return { id, slug: created.body.slug as string };
  }

  /** Three films: for everyone, from twelve, from sixteen, and one nobody rated. */
  async function shelf() {
    const all = await createMovie('Paper Boats', { ageRating: 'FSK 0' });
    const twelve = await createMovie('Glass Tide', { ageRating: 'FSK 12' });
    const sixteen = await createMovie('Night Train', { ageRating: 'FSK 16' });
    const unrated = await createMovie('Open Door');
    return { all, twelve, sixteen, unrated };
  }

  const titles = async (query = '', cookie?: string) => {
    const request = http().get(`/v1/catalog/titles?sort=name${query}`);
    const response = await (cookie ? request.set('Cookie', cookie) : request).expect(200);
    return {
      names: (response.body.items as { name: string }[]).map((item) => item.name),
      cache: response.headers['cache-control'] as string | undefined,
    };
  };
  const profiles = async (cookie: string) =>
    (await http().get('/v1/viewer/profiles').set('Cookie', cookie).expect(200)).body as {
      profiles: Profile[];
      currentId: string;
    };
  const createProfile = (cookie: string, body: Record<string, unknown>) =>
    http().post('/v1/viewer/profiles').set('Cookie', cookie).send(body);
  const select = (cookie: string, id: string, body: Record<string, unknown> = {}) =>
    http().post(`/v1/viewer/profiles/${id}/select`).set('Cookie', cookie).send(body);
  const setPin = (cookie: string, id: string, pin: string | null, password = ANNA.password) =>
    http().put(`/v1/viewer/profiles/${id}/pin`).set('Cookie', cookie).send({ pin, password });
  const play = (slug: string, cookie?: string) => {
    const request = http().post(`/v1/catalog/titles/${slug}/playback`);
    return cookie ? request.set('Cookie', cookie) : request;
  };

  /** Anna, with a profile for a child that the device is switched to. */
  async function withChild(body: Record<string, unknown> = { isKids: true }) {
    const anna = await register();
    const child = (await createProfile(anna.cookie, { name: 'Mia', ...body }).expect(201))
      .body as Profile;
    const main = (await profiles(anna.cookie)).profiles.find((profile) => profile.isMain)!;
    await select(anna.cookie, child.id).expect(200);
    return { anna, child, main };
  }

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-parental-'));
    testApp = await createTestApp(MODULES, {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      LIVE_PATH: path.join(workDirectory, 'live'),
      INGEST_API_URL: 'http://127.0.0.1:1',
    });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp.resetDatabase();
    await testApp.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  describe('the age of a title', () => {
    it('is read from the rating, and an admin can say it differently', async () => {
      const movie = await createMovie('Glass Tide', { ageRating: 'PG-13' });
      const title = () => http().get(`/v1/titles/${movie.id}`).set(admin()).expect(200);
      expect((await title()).body).toMatchObject({ ageRating: 'PG-13', minAge: 13 });

      // A rating without a number in it that is known.
      await http()
        .patch(`/v1/titles/${movie.id}`)
        .set(admin())
        .send({ ageRating: 'TV-MA' })
        .expect(200);
      expect((await title()).body.minAge).toBe(17);

      // The age said by hand wins over what the rating reads as.
      await http()
        .patch(`/v1/titles/${movie.id}`)
        .set(admin())
        .send({ ageRating: 'FSK 12', minAge: 10 })
        .expect(200);
      expect((await title()).body).toMatchObject({ ageRating: 'FSK 12', minAge: 10 });

      // A rating nobody can read leaves the title without an age.
      await http()
        .patch(`/v1/titles/${movie.id}`)
        .set(admin())
        .send({ ageRating: 'Livre' })
        .expect(200);
      expect((await title()).body.minAge).toBeNull();

      await http().patch(`/v1/titles/${movie.id}`).set(admin()).send({ minAge: 22 }).expect(400);
      await http().patch(`/v1/titles/${movie.id}`).set(admin()).send({ minAge: -1 }).expect(400);

      const open = await http().get(`/v1/catalog/titles/${movie.slug}`).expect(200);
      expect(open.body.minAge).toBeNull();
    });
  });

  describe('a limit asked for in the address', () => {
    it('narrows the open catalog for anyone, and hides what nobody rated', async () => {
      const { twelve, sixteen, unrated } = await shelf();

      const everything = await titles();
      expect(everything.names).toEqual(['Glass Tide', 'Night Train', 'Open Door', 'Paper Boats']);
      expect((await titles('&maxAge=12')).names).toEqual(['Glass Tide', 'Paper Boats']);
      expect((await titles('&maxAge=0')).names).toEqual(['Paper Boats']);
      expect((await titles('&maxAge=16')).names).toEqual([
        'Glass Tide',
        'Night Train',
        'Paper Boats',
      ]);
      // Not a number of years: no limit.
      expect((await titles('&maxAge=abc')).names).toHaveLength(4);

      await http().get(`/v1/catalog/titles/${twelve.slug}?maxAge=12`).expect(200);
      await http().get(`/v1/catalog/titles/${sixteen.slug}?maxAge=12`).expect(404);
      await http().get(`/v1/catalog/titles/${unrated.slug}?maxAge=12`).expect(404);
      await http().get(`/v1/catalog/titles/${sixteen.slug}`).expect(200);

      const found = await http().get('/v1/catalog/titles?q=night&maxAge=12').expect(200);
      expect(found.body.items).toEqual([]);
    });
  });

  describe('a profile with a limit', () => {
    it('starts at twelve for a child, and the main profile cannot have one', async () => {
      const anna = await register();
      const mia = await createProfile(anna.cookie, { name: 'Mia', isKids: true }).expect(201);
      expect(mia.body).toMatchObject({ isKids: true, maxAge: 12, locked: false });
      const tom = await createProfile(anna.cookie, { name: 'Tom', maxAge: 16 }).expect(201);
      expect(tom.body).toMatchObject({ isKids: false, maxAge: 16 });
      const small = await createProfile(anna.cookie, {
        name: 'Lou',
        isKids: true,
        maxAge: 6,
      }).expect(201);
      expect(small.body.maxAge).toBe(6);
      await createProfile(anna.cookie, { name: 'Bad', maxAge: 19 }).expect(400);

      const { profiles: all } = await profiles(anna.cookie);
      const main = all.find((profile) => profile.isMain)!;
      expect(main).toMatchObject({ isKids: false, maxAge: null, locked: false });
      await http()
        .patch(`/v1/viewer/profiles/${main.id}`)
        .set('Cookie', anna.cookie)
        .send({ maxAge: 12 })
        .expect(409);
      await http()
        .patch(`/v1/viewer/profiles/${main.id}`)
        .set('Cookie', anna.cookie)
        .send({ isKids: true })
        .expect(409);

      // Lifting the limit of a profile.
      const lifted = await http()
        .patch(`/v1/viewer/profiles/${tom.body.id}`)
        .set('Cookie', anna.cookie)
        .send({ maxAge: null })
        .expect(200);
      expect(lifted.body.maxAge).toBeNull();
    });

    it('sees and plays only what suits it, whatever the address says', async () => {
      const { all, twelve, sixteen, unrated } = await shelf();
      const { anna, main } = await withChild();

      const seen = await titles('', anna.cookie);
      expect(seen.names).toEqual(['Glass Tide', 'Paper Boats']);
      // Narrowed by who is signed in: not for a shared cache.
      expect(seen.cache).toBe('private, no-store');
      // Asking for more does not give more. Asking for less gives less.
      expect((await titles('&maxAge=18', anna.cookie)).names).toEqual([
        'Glass Tide',
        'Paper Boats',
      ]);
      expect((await titles('&maxAge=6', anna.cookie)).names).toEqual(['Paper Boats']);

      await http().get(`/v1/catalog/titles/${sixteen.slug}`).set('Cookie', anna.cookie).expect(404);
      await play(all.slug, anna.cookie).expect(200);
      await play(twelve.slug, anna.cookie).expect(200);
      await play(sixteen.slug, anna.cookie).expect(404);
      await play(unrated.slug, anna.cookie).expect(404);

      // Back on the main profile everything is there again.
      await select(anna.cookie, main.id).expect(200);
      expect((await titles('', anna.cookie)).names).toHaveLength(4);
      await play(sixteen.slug, anna.cookie).expect(200);
    });

    it('cannot change profiles, the account or its devices, or spend money', async () => {
      const { anna, child, main } = await withChild();
      const refused = (response: Response) => {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('profile_restricted');
      };

      refused(await createProfile(anna.cookie, { name: 'Tom' }));
      refused(
        await http()
          .patch(`/v1/viewer/profiles/${child.id}`)
          .set('Cookie', anna.cookie)
          .send({ maxAge: 18 }),
      );
      refused(await http().delete(`/v1/viewer/profiles/${child.id}`).set('Cookie', anna.cookie));
      refused(
        await http()
          .post('/v1/viewer/checkout')
          .set('Cookie', anna.cookie)
          .send({ planId: '00000000-0000-4000-8000-000000000000', interval: 'MONTH' }),
      );
      refused(await http().post('/v1/viewer/billing-portal').set('Cookie', anna.cookie).send({}));
      refused(
        await http()
          .post('/v1/viewer/purchases/checkout')
          .set('Cookie', anna.cookie)
          .send({ titleId: '00000000-0000-4000-8000-000000000000', kind: 'RENT' }),
      );

      // Nor the account itself, or the devices on it.
      refused(
        await http().patch('/v1/viewer/me').set('Cookie', anna.cookie).send({ displayName: 'Mia' }),
      );
      refused(
        await http()
          .post('/v1/viewer/password')
          .set('Cookie', anna.cookie)
          .send({ currentPassword: ANNA.password, newPassword: 'another-long-one' }),
      );
      refused(
        await http()
          .post('/v1/viewer/delete')
          .set('Cookie', anna.cookie)
          .send({ password: ANNA.password }),
      );
      refused(
        await http()
          .delete('/v1/viewer/sessions/00000000-0000-4000-8000-000000000000')
          .set('Cookie', anna.cookie),
      );
      refused(
        await http()
          .delete('/v1/viewer/devices/00000000-0000-4000-8000-000000000000')
          .set('Cookie', anna.cookie),
      );
      refused(
        await http().post('/v1/viewer/device-codes/ABCD-EFGH/approve').set('Cookie', anna.cookie),
      );
      // A child may choose the language of the sound and of the subtitles.
      await http()
        .patch('/v1/viewer/preferences')
        .set('Cookie', anna.cookie)
        .send({ audioLanguage: 'de' })
        .expect(200);
      // Reading stays open: the menu of the website asks for these.
      await http().get('/v1/viewer/me').set('Cookie', anna.cookie).expect(200);

      // A PIN asks for the password of the account, so it is not refused here:
      // that is the way out for a parent who forgot theirs.
      await setPin(anna.cookie, main.id, '1234', 'a-guess').expect(400);

      // The main profile still can.
      await select(anna.cookie, main.id).expect(200);
      await createProfile(anna.cookie, { name: 'Tom' }).expect(201);
    });

    it('sees only the channels that suit it', async () => {
      const channel = async (name: string, minAge: number | null) =>
        (
          await http()
            .post('/v1/channels')
            .set(admin())
            .send({ name, source: SOURCE, published: true, start: false, minAge })
            .expect(201)
        ).body as { id: string; slug: string; minAge: number | null };
      const kids = await channel('Kids One', 0);
      const late = await channel('Late Night', 16);
      await channel('News 24', null);
      expect(late.minAge).toBe(16);

      const names = async (query = '', cookie?: string) => {
        const request = http().get(`/v1/catalog/channels${query}`);
        const response = await (cookie ? request.set('Cookie', cookie) : request).expect(200);
        return (response.body as { name: string }[]).map((item) => item.name).sort();
      };
      expect(await names()).toEqual(['Kids One', 'Late Night', 'News 24']);
      expect(await names('?maxAge=12')).toEqual(['Kids One']);

      const { anna } = await withChild();
      expect(await names('', anna.cookie)).toEqual(['Kids One']);
      await http().get(`/v1/catalog/channels/${kids.slug}`).set('Cookie', anna.cookie).expect(200);
      await http().get(`/v1/catalog/channels/${late.slug}`).set('Cookie', anna.cookie).expect(404);
      await http()
        .post(`/v1/catalog/channels/${late.slug}/playback`)
        .set('Cookie', anna.cookie)
        .expect(404);

      await http().patch(`/v1/channels/${late.id}`).set(admin()).send({ minAge: 6 }).expect(200);
      expect(await names('', anna.cookie)).toEqual(['Kids One', 'Late Night']);
    });
  });

  describe('a PIN on a profile', () => {
    it('is set and lifted with the password of the account', async () => {
      const anna = await register();
      const { profiles: all } = await profiles(anna.cookie);
      const main = all[0]!;

      await setPin(anna.cookie, main.id, '1234', 'not-the-password').expect(400);
      await setPin(anna.cookie, main.id, '12').expect(400);
      await setPin(anna.cookie, main.id, 'abcd').expect(400);
      const locked = await setPin(anna.cookie, main.id, '1234').expect(200);
      expect(locked.body.locked).toBe(true);
      // The PIN itself is never given out, not even scrambled.
      expect(JSON.stringify(locked.body)).not.toContain('pin');
      const stored = await testApp.prisma.viewerProfile.findUniqueOrThrow({
        where: { id: main.id },
      });
      expect(stored.pinHash).not.toContain('1234');

      const open = await setPin(anna.cookie, main.id, null).expect(200);
      expect(open.body.locked).toBe(false);
    });

    it('is asked for when the profile is chosen, and locks after five wrong ones', async () => {
      const { anna, main, child } = await withChild();
      await select(anna.cookie, main.id).expect(200);
      await setPin(anna.cookie, main.id, '4821').expect(200);
      await select(anna.cookie, child.id).expect(200);

      const without = await select(anna.cookie, main.id).expect(403);
      expect(without.body.code).toBe('pin_required');
      const wrong = await select(anna.cookie, main.id, { pin: '0000' }).expect(403);
      expect(wrong.body).toMatchObject({ code: 'pin_wrong', attemptsLeft: 4 });
      // Still the child's profile.
      expect((await profiles(anna.cookie)).currentId).toBe(child.id);

      await select(anna.cookie, main.id, { pin: '4821' }).expect(200);
      expect((await profiles(anna.cookie)).currentId).toBe(main.id);

      // The right PIN starts the count again.
      await select(anna.cookie, child.id).expect(200);
      for (const left of [4, 3, 2, 1]) {
        const answer = await select(anna.cookie, main.id, { pin: '1111' }).expect(403);
        expect(answer.body.attemptsLeft).toBe(left);
      }
      const fifth = await select(anna.cookie, main.id, { pin: '1111' }).expect(403);
      expect(fifth.body.attemptsLeft).toBe(0);
      const shut = await select(anna.cookie, main.id, { pin: '4821' }).expect(429);
      expect(shut.body.code).toBe('pin_locked');

      // After the wait the right PIN opens it.
      await testApp.prisma.viewerProfile.update({
        where: { id: main.id },
        data: { pinLockedUntil: new Date(Date.now() - 1000) },
      });
      await select(anna.cookie, main.id, { pin: '4821' }).expect(200);
    });

    it('makes a new sign-in choose a profile before it sees anything rated', async () => {
      const { twelve } = await shelf();
      const { anna, main, child } = await withChild();
      await select(anna.cookie, main.id).expect(200);
      await setPin(anna.cookie, main.id, '4821').expect(200);

      const login = await http()
        .post('/v1/viewer/login')
        .send({ email: ANNA.email, password: ANNA.password })
        .expect(200);
      expect(login.body.chooseProfile).toBe(true);
      const cookie = cookieOf(login);
      const session = await http().get('/v1/viewer/session').set('Cookie', cookie).expect(200);
      expect(session.body.chooseProfile).toBe(true);

      // Until then: only what suits every age, and nothing to manage.
      expect((await titles('', cookie)).names).toEqual(['Paper Boats']);
      await play(twelve.slug, cookie).expect(404);
      const refused = await createProfile(cookie, { name: 'Tom' }).expect(403);
      expect(refused.body.code).toBe('profile_restricted');

      // Choosing the child's profile needs no PIN, and opens what suits it.
      await select(cookie, child.id).expect(200);
      expect((await titles('', cookie)).names).toEqual(['Glass Tide', 'Paper Boats']);
      const after = await http().get('/v1/viewer/session').set('Cookie', cookie).expect(200);
      expect(after.body.chooseProfile).toBe(false);

      await select(cookie, main.id, { pin: '4821' }).expect(200);
      expect((await titles('', cookie)).names).toHaveLength(4);

      // The sign-in that set the PIN was never locked.
      expect((await titles('', anna.cookie)).names).toHaveLength(4);

      // A forgotten PIN: sign in, and take it off with the password.
      const again = cookieOf(
        await http()
          .post('/v1/viewer/login')
          .send({ email: ANNA.email, password: ANNA.password })
          .expect(200),
      );
      expect((await titles('', again)).names).toEqual(['Paper Boats']);
      await setPin(again, main.id, null).expect(200);
      expect((await titles('', again)).names).toHaveLength(4);
    });

    it('can be taken off by an admin, and that is written down', async () => {
      const anna = await register();
      const main = (await profiles(anna.cookie)).profiles[0]!;
      await setPin(anna.cookie, main.id, '4821').expect(200);

      const shown = await http().get(`/v1/viewers/${anna.id}`).set(admin()).expect(200);
      expect(shown.body.profiles[0]).toMatchObject({ isMain: true, locked: true, maxAge: null });

      await http().delete(`/v1/viewers/${anna.id}/profiles/${main.id}/pin`).expect(401);
      await http()
        .delete(`/v1/viewers/${anna.id}/profiles/${main.id}/pin`)
        .set(admin())
        .expect(204);
      expect((await profiles(anna.cookie)).profiles[0]!.locked).toBe(false);
      const logged = await testApp.prisma.auditLog.findFirst({
        where: { action: 'viewer.profile_pin_clear' },
      });
      expect(logged).toMatchObject({ entityId: anna.id, metadata: { profile: main.name } });

      await http()
        .delete(`/v1/viewers/${anna.id}/profiles/00000000-0000-4000-8000-000000000000/pin`)
        .set(admin())
        .expect(404);
    });
  });
});
