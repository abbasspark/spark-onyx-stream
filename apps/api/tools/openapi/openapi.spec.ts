// SPDX-License-Identifier: AGPL-3.0-only
//
// Produces the description of the API from the source, and fails when the
// one in the repository is no longer what the source says.
//
//   pnpm openapi          writes openapi.json
//   pnpm test             checks it
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';
import { buildDocument, type BuildReport } from './document.js';

const apiRoot = path.resolve(import.meta.dirname, '../..');
const target = path.join(apiRoot, 'src/openapi/openapi.json');
/** The types that clients are written against, generated from the same description. */
const typesTarget = path.resolve(apiRoot, '../../packages/api-client/src/schema.d.ts');
const TYPES_HEADER =
  '// SPDX-License-Identifier: AGPL-3.0-only\n//\n// Generated from the description of the API. Do not edit: run "pnpm openapi".\n\n';
const packageVersion = (
  JSON.parse(readFileSync(path.join(apiRoot, 'package.json'), 'utf8')) as { version: string }
).version;

describe('the description of the API', () => {
  let text: string;
  let types: string;
  let report: BuildReport;

  beforeAll(async () => {
    const built = await buildDocument(apiRoot, packageVersion);
    const document = built.document;
    report = built.report;
    text = `${JSON.stringify(document, null, 2)}\n`;
    types = TYPES_HEADER + astToString(await openapiTS(structuredClone(document) as never));
    if (process.env.OPENAPI_WRITE === '1') {
      writeFileSync(target, text);
      writeFileSync(typesTarget, types);
    }
  }, 120_000);

  it('is the one in the repository', () => {
    const stored = readFileSync(target, 'utf8');
    // Not toBe: a difference would print two files of twenty thousand lines.
    expect(
      stored === text,
      'openapi.json is out of date. Run "pnpm openapi" in apps/api and commit the result.',
    ).toBe(true);
  });

  it('has the types of clients generated from it', () => {
    expect(
      readFileSync(typesTarget, 'utf8') === types,
      'packages/api-client/src/schema.d.ts is out of date. Run "pnpm openapi" and commit the result.',
    ).toBe(true);
  });

  it('says in a line what every endpoint for viewers and apps does', () => {
    expect(report.unsummarized, 'Write a comment above these handlers').toEqual([]);
  });

  it('knows every folder that has endpoints', () => {
    expect(report.folders, 'Give these folders a name in tools/openapi/document.ts').toEqual([]);
  });

  it('describes what every endpoint answers', () => {
    expect(report.undescribed).toEqual([]);
  });
});
