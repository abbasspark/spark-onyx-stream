// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of encoding profile management against a real PostgreSQL
// database. Skipped unless TEST_DATABASE_URL is set.
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { ProcessingApiModule } from '../src/processing/processing.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const PROFILE = {
  name: 'mobile',
  description: 'Two small qualities for mobile data',
  segmentSeconds: 6,
  keyframeSeconds: 2,
  renditions: [
    { name: '480p', height: 480, videoBitrate: 1_200_000, audioBitrate: 96_000 },
    { name: '240p', height: 240, videoBitrate: 400_000, audioBitrate: 64_000, preset: 'fast' },
  ],
};

describe.skipIf(!TEST_DATABASE_URL)('Encoding profiles (e2e, real database)', () => {
  let testApp: TestApp;
  let ownerToken: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);

  beforeAll(async () => {
    testApp = await createTestApp([ProcessingApiModule, AdminsModule, AssetsModule]);
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp?.close();
  });

  it('creates a profile and keeps the order of its qualities', async () => {
    // The first read creates the built-in profile on a fresh installation.
    await http().get('/v1/encoding-profiles').set(auth()).expect(200);

    const created = await http()
      .post('/v1/encoding-profiles')
      .set(auth())
      .send(PROFILE)
      .expect(201);

    expect(created.body).toMatchObject({ name: 'mobile', isDefault: false, segmentSeconds: 6 });
    expect(
      created.body.renditions.map((r: { name: string; preset: string }) => `${r.name}:${r.preset}`),
    ).toEqual(['480p:medium', '240p:fast']);

    await http().post('/v1/encoding-profiles').set(auth()).send(PROFILE).expect(409);
    const list = await http().get('/v1/encoding-profiles').set(auth()).expect(200);
    expect(list.body.map((profile: { name: string }) => profile.name).sort()).toEqual([
      'default',
      'mobile',
    ]);
  });

  it('rejects settings that cannot produce aligned or valid output', async () => {
    const send = (change: Record<string, unknown>) =>
      http()
        .post('/v1/encoding-profiles')
        .set(auth())
        .send({ ...PROFILE, ...change });
    const [first] = PROFILE.renditions;

    // The keyframe interval has to divide the segment length.
    await send({ segmentSeconds: 4, keyframeSeconds: 3 }).expect(400);
    await send({ renditions: [] }).expect(400);
    await send({ renditions: [{ ...first, height: 481 }] }).expect(400);
    await send({ renditions: [{ ...first, name: '../etc' }] }).expect(400);
    await send({ renditions: [first, { ...first, name: 'copy' }] }).expect(400);
    await send({ renditions: [{ ...first, preset: 'warp-speed' }] }).expect(400);
  });

  it('updates a profile and replaces its qualities', async () => {
    const created = await http()
      .post('/v1/encoding-profiles')
      .set(auth())
      .send(PROFILE)
      .expect(201);

    const updated = await http()
      .patch(`/v1/encoding-profiles/${created.body.id}`)
      .set(auth())
      .send({
        name: 'mobile-v2',
        renditions: [{ name: '360p', height: 360, videoBitrate: 700_000, audioBitrate: 96_000 }],
      })
      .expect(200);
    expect(updated.body.name).toBe('mobile-v2');
    expect(updated.body.renditions.map((r: { name: string }) => r.name)).toEqual(['360p']);

    // The segment length stays 6, which 4 does not divide.
    await http()
      .patch(`/v1/encoding-profiles/${created.body.id}`)
      .set(auth())
      .send({ keyframeSeconds: 4 })
      .expect(400);
  });

  it('keeps exactly one default profile', async () => {
    const created = await http()
      .post('/v1/encoding-profiles')
      .set(auth())
      .send(PROFILE)
      .expect(201);

    await http()
      .patch(`/v1/encoding-profiles/${created.body.id}`)
      .set(auth())
      .send({ isDefault: true })
      .expect(200);

    const list = await http().get('/v1/encoding-profiles').set(auth()).expect(200);
    const defaults = list.body.filter((profile: { isDefault: boolean }) => profile.isDefault);
    expect(defaults.map((profile: { name: string }) => profile.name)).toEqual(['mobile']);
  });

  it('refuses to delete the default profile or one that assets use', async () => {
    const list = await http().get('/v1/encoding-profiles').set(auth()).expect(200);
    const defaultProfile = list.body[0];
    await http().delete(`/v1/encoding-profiles/${defaultProfile.id}`).set(auth()).expect(409);

    const created = await http()
      .post('/v1/encoding-profiles')
      .set(auth())
      .send(PROFILE)
      .expect(201);
    const asset = (
      await http().post('/v1/assets').set(auth()).send({ title: 'Uses the profile' }).expect(201)
    ).body.asset as { id: string };
    await testApp.prisma.asset.update({
      where: { id: asset.id },
      data: { encodingProfileId: created.body.id },
    });
    await http().delete(`/v1/encoding-profiles/${created.body.id}`).set(auth()).expect(409);

    await testApp.prisma.asset.delete({ where: { id: asset.id } });
    await http().delete(`/v1/encoding-profiles/${created.body.id}`).set(auth()).expect(204);
    await http().get(`/v1/encoding-profiles/${created.body.id}`).set(auth()).expect(404);
  });

  it('lets editors manage profiles and viewers only read them', async () => {
    for (const role of ['EDITOR', 'VIEWER']) {
      await http()
        .post('/v1/admins')
        .set(auth())
        .send({
          email: `${role.toLowerCase()}@example.com`,
          displayName: role,
          password: 'a-long-password-123',
          role,
        })
        .expect(201);
    }
    const editor = testApp.bearer(await testApp.login('editor@example.com', 'a-long-password-123'));
    const viewer = testApp.bearer(await testApp.login('viewer@example.com', 'a-long-password-123'));

    await http().post('/v1/encoding-profiles').set(editor).send(PROFILE).expect(201);
    await http().get('/v1/encoding-profiles').set(viewer).expect(200);
    await http()
      .post('/v1/encoding-profiles')
      .set(viewer)
      .send({ ...PROFILE, name: 'other' })
      .expect(403);
  });
});
