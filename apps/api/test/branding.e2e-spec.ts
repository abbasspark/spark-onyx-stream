// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of site branding: what the panel sets, what the website
// reads, and where else the name of the site shows.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

/** The start of a PNG file, which is all the server reads to recognize it. */
function png(width: number, height: number): Buffer {
  const data = Buffer.alloc(133);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write('IHDR', 12, 'latin1');
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}
/** The start of a JPEG file with its size. */
function jpeg(width: number, height: number): Buffer {
  const data = Buffer.alloc(64);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]).copy(data, 0);
  data.writeUInt16BE(height, 7);
  data.writeUInt16BE(width, 9);
  return data;
}

const EMPTY = {
  name: null,
  description: null,
  logoId: null,
  logoShowsName: false,
  iconId: null,
  accent: null,
  footerText: null,
  footerLinks: [],
};

describe.skipIf(!TEST_DATABASE_URL)('Site branding (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let workDirectory: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const put = (body: object) => http().put('/v1/branding').set(auth()).send(body);
  const site = async () => (await http().get('/v1/catalog/site').expect(200)).body;
  const image = async (data: Buffer, kind = 'LOGO') =>
    (
      await http()
        .post(`/v1/images?kind=${kind}`)
        .set(auth())
        .set('Content-Type', 'application/octet-stream')
        .send(data)
        .expect(201)
    ).body as { id: string; url: string };

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-branding-'));
    testApp = await createTestApp([AssetsModule, AdminsModule, CatalogModule], {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      SITE_NAME: 'Harbour TV',
    });
  });
  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });
  afterAll(async () => {
    await testApp?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  it('ships with the name of the installation, its own mark and its own colour', async () => {
    expect(await site()).toEqual({
      name: 'Harbour TV',
      description: 'Movies and series, streamed to you.',
      logo: null,
      logoShowsName: false,
      icon: null,
      accent: null,
      footerText: null,
      footerLinks: [],
    });

    const view = await http().get('/v1/branding').set(auth()).expect(200);
    expect(view.body).toEqual({
      settings: EMPTY,
      logo: null,
      icon: null,
      defaults: {
        name: 'Harbour TV',
        description: 'Movies and series, streamed to you.',
        accent: '#e6a85c',
      },
      minimumContrast: 4.5,
    });
  });

  it('shows the website what the panel sets', async () => {
    const logo = await image(png(600, 160));
    const icon = await image(png(512, 512));

    const saved = await put({
      name: ' Kino Nord ',
      description: 'Films from the north.',
      logoId: logo.id,
      logoShowsName: true,
      iconId: icon.id,
      accent: '#4FC3F7',
      footerText: '© 2026 Kino Nord GmbH',
      footerLinks: [
        { label: 'Imprint', url: '/imprint' },
        { label: 'Contact', url: 'mailto:hello@example.com' },
      ],
    }).expect(200);
    expect(saved.body.settings).toMatchObject({ name: 'Kino Nord', accent: '#4fc3f7' });
    expect(saved.body.logo).toMatchObject({ id: logo.id, width: 600, height: 160 });

    const shown = await site();
    expect(shown).toMatchObject({
      name: 'Kino Nord',
      description: 'Films from the north.',
      logo: { url: logo.url, width: 600, height: 160 },
      logoShowsName: true,
      icon: { url: icon.url, width: 512, height: 512 },
      footerText: '© 2026 Kino Nord GmbH',
      footerLinks: [
        { label: 'Imprint', url: '/imprint' },
        { label: 'Contact', url: 'mailto:hello@example.com' },
      ],
    });
    expect(shown.accent.color).toBe('#4fc3f7');
    expect(shown.accent.deep).toMatch(/^#[0-9a-f]{6}$/);
    expect(shown.accent.deep).not.toBe('#4fc3f7');

    const entry = await testApp.prisma.auditLog.findFirst({ where: { action: 'branding.update' } });
    expect(entry?.metadata).toEqual({
      name: 'Kino Nord',
      accent: '#4fc3f7',
      logo: true,
      icon: true,
      footerLinks: 2,
    });
  });

  it('refuses a colour that cannot be read on black, and names one that can', async () => {
    const refused = await put({ ...EMPTY, accent: '#1a3c8f' }).expect(422);
    expect(refused.body).toMatchObject({ code: 'accent_too_dark' });
    expect(refused.body.suggestion).toMatch(/^#[0-9a-f]{6}$/);

    await put({ ...EMPTY, accent: refused.body.suggestion }).expect(200);
    await put({ ...EMPTY, accent: 'blue' }).expect(400);
  });

  it('asks for a square PNG as the icon, and for pictures that exist', async () => {
    const wide = await image(png(600, 160));
    const photo = await image(jpeg(512, 512));
    const tiny = await image(png(32, 32));

    const notSquare = await put({ ...EMPTY, iconId: wide.id }).expect(422);
    expect(notSquare.body.message).toMatch(/square/);
    const notPng = await put({ ...EMPTY, iconId: photo.id }).expect(422);
    expect(notPng.body.message).toMatch(/PNG/);
    await put({ ...EMPTY, iconId: tiny.id }).expect(422);
    await put({ ...EMPTY, logoId: '01900000-0000-7000-8000-000000000000' }).expect(422);
    // A photo is fine as a logo.
    await put({ ...EMPTY, logoId: photo.id }).expect(200);
  });

  it('refuses footer links that lead nowhere or run code', async () => {
    for (const url of ['javascript:alert(1)', 'imprint', '//evil.example']) {
      await put({ ...EMPTY, footerLinks: [{ label: 'Bad', url }] }).expect(400);
    }
    const many = Array.from({ length: 9 }, (_, index) => ({ label: `L${index}`, url: '/a' }));
    await put({ ...EMPTY, footerLinks: many }).expect(400);
  });

  it('keeps a picture the branding shows, and lets it go afterwards', async () => {
    const logo = await image(png(600, 160));
    await put({ ...EMPTY, logoId: logo.id }).expect(200);
    await http().delete(`/v1/images/${logo.id}`).set(auth()).expect(409);

    const reset = await http().delete('/v1/branding').set(auth()).expect(200);
    expect(reset.body.settings).toEqual(EMPTY);
    expect((await site()).logo).toBeNull();
    await http().delete(`/v1/images/${logo.id}`).set(auth()).expect(204);
  });

  it('leaves out a picture that is gone instead of failing', async () => {
    const logo = await image(png(600, 160));
    await put({ ...EMPTY, name: 'Kino Nord', logoId: logo.id }).expect(200);
    await testApp.prisma.image.delete({ where: { id: logo.id } });
    expect(await site()).toMatchObject({ name: 'Kino Nord', logo: null });
  });

  it('puts the name where the site speaks: the mail settings and the sign-in code', async () => {
    await put({ ...EMPTY, name: 'Kino Nord' }).expect(200);

    const mail = await http().get('/v1/mail').set(auth()).expect(200);
    expect(mail.body.siteName).toBe('Kino Nord');

    const setup = await http()
      .post('/v1/auth/two-factor/setup')
      .set(auth())
      .send({ password: 'owner-password-123' })
      .expect(200);
    expect(decodeURIComponent(setup.body.uri)).toContain('Kino Nord:owner@example.com');
  });

  it('can be read by anyone and changed only with the right to change settings', async () => {
    await http()
      .post('/v1/admins')
      .set(auth())
      .send({
        email: 'editor@example.com',
        displayName: 'Edith Editor',
        password: 'another-long-password',
        role: 'EDITOR',
      })
      .expect(201);
    const editor = testApp.bearer(
      await testApp.login('editor@example.com', 'another-long-password'),
    );

    await http().get('/v1/catalog/site').expect(200);
    await http().get('/v1/branding').set(editor).expect(403);
    await http().put('/v1/branding').set(editor).send(EMPTY).expect(403);
    await http().delete('/v1/branding').set(editor).expect(403);
    await http().get('/v1/branding').expect(401);
  });
});
