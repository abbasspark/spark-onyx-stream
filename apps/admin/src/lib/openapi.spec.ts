// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  accessLabel,
  curlFor,
  exampleOf,
  groupOperations,
  limitsOf,
  listOperations,
  matchesOperation,
  type OpenApiDocument,
  resolveSchema,
  shortPath,
  splitNull,
  titleOf,
  typeLabel,
} from './openapi';

const DOCUMENT: OpenApiDocument = {
  openapi: '3.1.0',
  info: { title: 'Test', version: '1.0.0' },
  tags: [
    { name: 'Webhooks', description: 'Other systems.' },
    { name: 'Catalog', description: 'Titles.' },
  ],
  paths: {
    '/v1/catalog/titles/{slug}': {
      get: {
        operationId: 'PublicCatalog_get',
        tags: ['Catalog'],
        summary: 'One title',
        description: 'With its seasons. Open to everyone.',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'The answer.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Title' } } },
          },
        },
        'x-onyx-access': { kind: 'public', permissions: [], sessionOnly: false },
      },
    },
    '/v1/webhooks': {
      post: {
        operationId: 'Webhooks_create',
        tags: ['Webhooks'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 60 },
                  events: { type: 'array', minItems: 1, items: { type: 'string' } },
                  note: { type: 'string' },
                },
                required: ['name', 'events'],
              },
            },
          },
        },
        responses: { '201': { description: 'The answer.' }, '403': { description: 'No.' } },
        'x-onyx-access': { kind: 'admin', permissions: ['settings:write'], sessionOnly: true },
      },
      get: {
        operationId: 'Webhooks_list',
        tags: ['Webhooks'],
        summary: 'Every webhook',
        description: 'For an admin or an API key. Needs settings:read.',
        responses: {},
        'x-onyx-access': { kind: 'admin', permissions: ['settings:read'], sessionOnly: false },
      },
    },
  },
  components: {
    schemas: {
      Title: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { $ref: '#/components/schemas/Status' },
          parent: { anyOf: [{ $ref: '#/components/schemas/Title' }, { type: 'null' }] },
        },
        required: ['id', 'status', 'parent'],
      },
      Status: { type: 'string', enum: ['DRAFT', 'PUBLISHED'] },
    },
  },
};
const operations = listOperations(DOCUMENT);
const byId = (id: string) => operations.find((operation) => operation.id === id)!;

describe('listOperations', () => {
  it('reads every endpoint with what it takes and answers', () => {
    expect(operations.map((operation) => operation.id)).toEqual([
      'PublicCatalog_get',
      'Webhooks_list',
      'Webhooks_create',
    ]);
    const create = byId('Webhooks_create');
    expect(create.body?.contentType).toBe('application/json');
    expect(create.answers.map((answer) => [answer.status, answer.schema])).toEqual([
      ['201', null],
      ['403', null],
    ]);
    expect(byId('PublicCatalog_get').answers[0]?.schema).toEqual({
      $ref: '#/components/schemas/Title',
    });
  });

  it('leaves the sentence about who may call to the marks of the page', () => {
    expect(byId('PublicCatalog_get').description).toBe('With its seasons.');
    expect(byId('Webhooks_list').description).toBe('');
  });

  it('groups them by area, in the order of the document', () => {
    expect(
      groupOperations(DOCUMENT, operations).map((group) => [group.name, group.operations.length]),
    ).toEqual([
      ['Webhooks', 2],
      ['Catalog', 1],
    ]);
    expect(groupOperations(DOCUMENT, operations.slice(0, 1)).map((group) => group.name)).toEqual([
      'Catalog',
    ]);
  });
});

describe('finding an endpoint', () => {
  it('needs every word, anywhere', () => {
    const create = byId('Webhooks_create');
    expect(matchesOperation(create, '', 'all')).toBe(true);
    expect(matchesOperation(create, 'post webhooks', 'all')).toBe(true);
    expect(matchesOperation(create, 'settings:write', 'all')).toBe(true);
    expect(matchesOperation(create, 'webhooks titles', 'all')).toBe(false);
  });

  it('narrows by who may call', () => {
    expect(
      operations.filter((operation) => matchesOperation(operation, '', 'public')),
    ).toHaveLength(1);
    expect(operations.filter((operation) => matchesOperation(operation, '', 'admin'))).toHaveLength(
      2,
    );
    expect(
      operations.filter((operation) => matchesOperation(operation, '', 'viewer')),
    ).toHaveLength(0);
  });

  it('names an endpoint by what it does, or by its address', () => {
    expect(titleOf(byId('Webhooks_list'))).toBe('Every webhook');
    expect(titleOf(byId('Webhooks_create'))).toBe('POST /webhooks');
    expect(shortPath('/v1/catalog/titles/{slug}')).toBe('/catalog/titles/{slug}');
  });

  it('says who may call', () => {
    expect(accessLabel(byId('PublicCatalog_get').access)).toBe('Open to everyone');
    expect(accessLabel(byId('Webhooks_list').access)).toBe('Admin or API key');
    expect(accessLabel(byId('Webhooks_create').access)).toBe('Signed-in admin only');
    expect(accessLabel({ kind: 'viewer', permissions: [], sessionOnly: false })).toBe(
      'Signed-in viewer',
    );
  });
});

describe('schemas', () => {
  it('follows references, also ones wrapped to carry a description', () => {
    expect(resolveSchema({ $ref: '#/components/schemas/Status' }, DOCUMENT)).toEqual({
      schema: { type: 'string', enum: ['DRAFT', 'PUBLISHED'] },
      name: 'Status',
    });
    const described = resolveSchema(
      { allOf: [{ $ref: '#/components/schemas/Status' }], description: 'Where it stands.' },
      DOCUMENT,
    );
    expect(described.name).toBe('Status');
    expect(described.schema.description).toBe('Where it stands.');
    expect(resolveSchema({ type: 'string' }, DOCUMENT).name).toBeNull();
  });

  it('takes "or null" apart', () => {
    expect(splitNull({ type: ['string', 'null'], format: 'date-time' })).toEqual({
      schema: { type: 'string', format: 'date-time' },
      nullable: true,
    });
    expect(splitNull({ anyOf: [{ $ref: '#/x/Title' }, { type: 'null' }] })).toEqual({
      schema: { $ref: '#/x/Title' },
      nullable: true,
    });
    expect(splitNull({ type: 'number' }).nullable).toBe(false);
  });

  it('says what a schema is in a few words', () => {
    const label = (schema: Parameters<typeof typeLabel>[0]) => typeLabel(schema, DOCUMENT);
    expect(label({ type: 'string' })).toBe('text');
    expect(label({ type: ['string', 'null'], format: 'date-time' })).toBe('date and time or null');
    expect(label({ type: 'array', items: { $ref: '#/components/schemas/Title' } })).toBe(
      'list of Title',
    );
    expect(label({ anyOf: [{ $ref: '#/components/schemas/Title' }, { type: 'null' }] })).toBe(
      'Title or null',
    );
    expect(label({ type: 'string', enum: ['a', 'b'] })).toBe('"a" | "b"');
    expect(label({ type: 'string', enum: ['a', 'b', 'c', 'd', 'e'] })).toBe('one of 5 values');
    expect(label({ type: 'boolean', const: true })).toBe('true');
    expect(label({ type: 'integer' })).toBe('whole number');
    expect(label({ type: 'object', additionalProperties: {} })).toBe('object with any keys');
    expect(label({})).toBe('anything');
  });

  it('puts limits into words', () => {
    expect(limitsOf({ type: 'string', minLength: 1, maxLength: 60 })).toEqual([
      '1 to 60 characters',
    ]);
    expect(limitsOf({ type: 'number', minimum: 1, default: 20 })).toEqual([
      'at least 1',
      '20 when left out',
    ]);
    expect(limitsOf({ type: 'array', maxItems: 5 })).toEqual(['at most 5 items']);
    expect(limitsOf({ type: 'array', minItems: 1 })).toEqual(['at least 1 item']);
    expect(limitsOf({ type: 'string' })).toEqual([]);
  });

  it('makes an example of what has to be sent, and ends on a schema that contains itself', () => {
    expect(exampleOf(byId('Webhooks_create').body!.schema, DOCUMENT)).toEqual({
      name: 'text',
      events: ['text'],
    });
    const title = exampleOf({ $ref: '#/components/schemas/Title' }, DOCUMENT) as Record<
      string,
      unknown
    >;
    expect(title.status).toBe('DRAFT');
    expect(title.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(title).length).toBeLessThan(2000);
  });
});

describe('curlFor', () => {
  it('writes the call with its sign-in and its body', () => {
    expect(curlFor(byId('Webhooks_create'), 'https://tv.example.com', DOCUMENT)).toBe(
      [
        "curl -X POST 'https://tv.example.com/v1/webhooks' \\",
        "  -H 'Authorization: Bearer <admin token>' \\",
        "  -H 'Content-Type: application/json' \\",
        `  -d '{\n  "name": "text",\n  "events": [\n    "text"\n  ]\n}'`,
      ].join('\n'),
    );
    expect(curlFor(byId('PublicCatalog_get'), '', DOCUMENT)).toBe(
      "curl -X GET '/v1/catalog/titles/<slug>'",
    );
    expect(curlFor(byId('Webhooks_list'), '', DOCUMENT)).toContain('<API key>');
  });
});
