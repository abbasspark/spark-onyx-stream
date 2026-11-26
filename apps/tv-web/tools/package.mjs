// SPDX-License-Identifier: AGPL-3.0-only
//
// Makes the folders that are packed into an app for Samsung and LG:
//
//   node tools/package.mjs --server https://tv.example.com --name "My Stream"
//
// The result is in dist-packages/tizen and dist-packages/webos. The package
// on the television holds only a small page that opens the app from the
// server, so this does not need the built app. Packing and signing are done
// with the makers' own tools, which need your certificate: see docs/tv-web.md.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const { values } = parseArgs({
  options: {
    server: { type: 'string', default: '' },
    name: { type: 'string', default: 'Onyx Stream' },
    id: { type: 'string', default: 'de.example.onyxstream' },
    vendor: { type: 'string', default: 'Operator' },
    version: {
      type: 'string',
      default: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
    },
    icon: { type: 'string', default: '' },
    out: { type: 'string', default: join(root, 'dist-packages') },
  },
});

/**
 * A Tizen package id is ten letters and digits, and the app id is that, a dot
 * and a name. Both are made from the id the operator chose, so that the same
 * id always gives the same package and two ids never share one.
 */
export function tizenIds(appId) {
  const digest = createHash('sha1').update(appId).digest();
  let number = BigInt('0x' + digest.subarray(0, 8).toString('hex'));
  let packageId = '';
  while (packageId.length < 10) {
    packageId += (number % 36n).toString(36);
    number /= 36n;
  }
  const letters = appId.replace(/[^A-Za-z0-9]/g, '');
  const appName = (letters.slice(-20) || 'OnyxStream').replace(/^[0-9]+/, 'App');
  return { packageId, appName };
}

/** The address as the wrapper wants it: no path, no trailing slash. Empty when none is given. */
export function serverAddress(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!text) {
    return '';
  }
  if (!/^https?:\/\/[^/\s]+$/i.test(text)) {
    throw new Error(`"${raw}" is not an address. Use the form https://tv.example.com`);
  }
  return text;
}

/** Fills the places a template marks with __NAME__. */
export function fill(template, replacements) {
  let result = template;
  for (const [name, value] of Object.entries(replacements)) {
    result = result.split(`__${name}__`).join(value);
  }
  return result;
}

function main() {
  const server = serverAddress(values.server);
  const { packageId, appName } = tizenIds(values.id);
  const replacements = {
    SERVER_URL: server,
    APP_ID: values.id,
    PACKAGE_ID: packageId,
    APP_NAME: appName,
    WIDGET_ID: `http://${values.id}/${appName}`,
    VERSION: values.version,
    VENDOR: values.vendor,
    DISPLAY_NAME: values.name.replace(/[<>&"]/g, ''),
  };

  rmSync(values.out, { recursive: true, force: true });
  const page = fill(readFileSync(join(root, 'platform', 'wrapper.html'), 'utf8'), replacements);
  const icon = values.icon || join(root, 'platform', 'icon.png');

  for (const [folder, manifest] of [
    ['tizen', 'config.xml'],
    ['webos', 'appinfo.json'],
  ]) {
    const target = join(values.out, folder);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'index.html'), page);
    writeFileSync(
      join(target, manifest),
      fill(readFileSync(join(root, 'platform', folder, manifest), 'utf8'), replacements),
    );
    if (existsSync(icon)) {
      copyFileSync(icon, join(target, 'icon.png'));
      if (folder === 'webos') {
        copyFileSync(icon, join(target, 'largeIcon.png'));
      }
    }
  }
  console.log(`Written to ${values.out}`);
  if (!existsSync(icon)) {
    console.log('No icon.png was found. Both stores need one: pass --icon <file> (512x512).');
  }
  if (!server) {
    console.log('No --server given: the television will ask for the address on first start.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
