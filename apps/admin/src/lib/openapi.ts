// SPDX-License-Identifier: AGPL-3.0-only
//
// Reading the description of the API (OpenAPI 3.1) for the reference page.

export type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  const?: unknown;
  enum?: unknown[];
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
};

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
export const METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

export interface Access {
  kind: 'public' | 'viewer' | 'admin';
  permissions: string[];
  sessionOnly: boolean;
}

export interface Parameter {
  name: string;
  in: 'path' | 'query';
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
}

interface Content {
  description?: string;
  content?: Record<string, { schema?: JsonSchema }>;
}

interface RawOperation {
  operationId: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: Content;
  responses?: Record<string, Content>;
  'x-onyx-access'?: Access;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  tags?: { name: string; description?: string }[];
  paths: Record<string, Partial<Record<HttpMethod, RawOperation>>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

export interface Answer {
  status: string;
  description: string;
  /** "application/json", or what else comes back. Null when nothing does. */
  contentType: string | null;
  schema: JsonSchema | null;
}

/** One endpoint, as the page shows it. */
export interface Operation {
  id: string;
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  description: string;
  access: Access;
  parameters: Parameter[];
  body: { contentType: string; schema: JsonSchema } | null;
  answers: Answer[];
}

/**
 * The description ends with who may call, for readers of the file. The page
 * shows that as marks of its own, so the sentence is taken off.
 */
const ACCESS_SENTENCE =
  /\s*(Open to everyone\.|For a signed-in viewer\.|For (an admin or an API key|a signed-in admin, not for API keys)\.( Needs [^.]+\.)?)$/;

const EVERYONE: Access = { kind: 'public', permissions: [], sessionOnly: false };

function contentOf(
  content: Content | undefined,
): { contentType: string; schema: JsonSchema } | null {
  const [entry] = Object.entries(content?.content ?? {});
  return entry ? { contentType: entry[0], schema: entry[1].schema ?? {} } : null;
}

/** Every endpoint of a document, in the order of its addresses. */
export function listOperations(document: OpenApiDocument): Operation[] {
  const operations: Operation[] = [];
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const method of METHODS) {
      const raw = methods[method];
      if (!raw) {
        continue;
      }
      operations.push({
        id: raw.operationId,
        method,
        path,
        tag: raw.tags?.[0] ?? 'Other',
        summary: raw.summary ?? '',
        description: (raw.description ?? '').replace(ACCESS_SENTENCE, '').trim(),
        access: raw['x-onyx-access'] ?? EVERYONE,
        parameters: raw.parameters ?? [],
        body: contentOf(raw.requestBody),
        answers: Object.entries(raw.responses ?? {}).map(([status, answer]) => {
          const content = contentOf(answer);
          return {
            status,
            description: answer.description ?? '',
            contentType: content?.contentType ?? null,
            schema: content?.schema ?? null,
          };
        }),
      });
    }
  }
  return operations;
}

export interface OperationGroup {
  name: string;
  description: string;
  operations: Operation[];
}

/** Endpoints by area, in the order the document names its areas. */
export function groupOperations(
  document: OpenApiDocument,
  operations: readonly Operation[],
): OperationGroup[] {
  const order = (document.tags ?? []).map((tag) => tag.name);
  const names = [...new Set([...order, ...operations.map((operation) => operation.tag)])];
  return names
    .map((name) => ({
      name,
      description: document.tags?.find((tag) => tag.name === name)?.description ?? '',
      operations: operations.filter((operation) => operation.tag === name),
    }))
    .filter((group) => group.operations.length > 0);
}

export type AccessFilter = 'all' | Access['kind'];

/** Whether an endpoint fits what was typed: every word has to be found somewhere. */
export function matchesOperation(
  operation: Operation,
  query: string,
  access: AccessFilter,
): boolean {
  if (access !== 'all' && operation.access.kind !== access) {
    return false;
  }
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const haystack = [
    operation.method,
    operation.path,
    operation.summary,
    operation.id,
    operation.tag,
    ...operation.access.permissions,
  ]
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** The line an endpoint goes by in a list: what it does, or its address when nobody wrote that down. */
export function titleOf(operation: Operation): string {
  return operation.summary || `${operation.method.toUpperCase()} ${shortPath(operation.path)}`;
}

/** The address without the part every address starts with. */
export function shortPath(path: string): string {
  return path.replace(/^\/v\d+(?=\/)/, '');
}

export function accessLabel(access: Access): string {
  if (access.kind === 'public') {
    return 'Open to everyone';
  }
  if (access.kind === 'viewer') {
    return 'Signed-in viewer';
  }
  return access.sessionOnly ? 'Signed-in admin only' : 'Admin or API key';
}

const refName = (ref: string) => ref.split('/').pop() ?? ref;

/** Follows a reference to the schema it names. A schema that is not a reference is returned as it is. */
export function resolveSchema(
  schema: JsonSchema,
  document: OpenApiDocument,
): { schema: JsonSchema; name: string | null } {
  // A description beside a reference is written as allOf with one member.
  const inner = schema.allOf?.length === 1 ? schema.allOf[0] : undefined;
  const ref = schema.$ref ?? inner?.$ref;
  if (!ref) {
    return { schema, name: null };
  }
  const name = refName(ref);
  const found = document.components?.schemas?.[name] ?? {};
  return {
    schema: schema.description ? { ...found, description: schema.description } : found,
    name,
  };
}

/** Whether "null" is one of the things a schema allows, and the schema without it. */
export function splitNull(schema: JsonSchema): { schema: JsonSchema; nullable: boolean } {
  if (Array.isArray(schema.type) && schema.type.includes('null')) {
    const rest = schema.type.filter((type) => type !== 'null');
    return { schema: { ...schema, type: rest.length === 1 ? rest[0] : rest }, nullable: true };
  }
  if (schema.anyOf?.some((member) => member.type === 'null')) {
    const rest = schema.anyOf.filter((member) => member.type !== 'null');
    const { anyOf: _, ...others } = schema;
    return {
      schema: rest.length === 1 ? { ...others, ...rest[0] } : { ...others, anyOf: rest },
      nullable: true,
    };
  }
  return { schema, nullable: false };
}

/** A schema in a few words: "text", "list of TitleCard", "one of 3". */
export function typeLabel(input: JsonSchema, document: OpenApiDocument): string {
  const { schema: bare, nullable } = splitNull(input);
  const { schema, name } = resolveSchema(bare, document);
  const label = (() => {
    if (name) {
      return name;
    }
    if (schema.const !== undefined) {
      return JSON.stringify(schema.const);
    }
    if (schema.enum) {
      return schema.enum.length <= 4
        ? schema.enum.map((value) => JSON.stringify(value)).join(' | ')
        : `one of ${schema.enum.length} values`;
    }
    if (schema.anyOf) {
      return schema.anyOf.map((member) => typeLabel(member, document)).join(' | ');
    }
    const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type;
    if (type === 'array') {
      return schema.items ? `list of ${typeLabel(schema.items, document)}` : 'list';
    }
    if (type === 'string') {
      const formats: Record<string, string> = {
        'date-time': 'date and time',
        uuid: 'id',
        binary: 'file',
        email: 'email address',
        uri: 'address',
      };
      return (schema.format && formats[schema.format]) || 'text';
    }
    if (type === 'number' || type === 'integer') {
      return type === 'integer' ? 'whole number' : 'number';
    }
    if (type === 'boolean') {
      return 'yes or no';
    }
    if (type === 'object') {
      return schema.properties ? 'object' : 'object with any keys';
    }
    return type ?? 'anything';
  })();
  return nullable ? `${label} or null` : label;
}

/** The limits a schema sets, in words: "1 to 60 characters". */
export function limitsOf(schema: JsonSchema): string[] {
  const limits: string[] = [];
  const range = (low: number | undefined, high: number | undefined, unit?: string) => {
    // "1 item", "2 items", and nothing after a bare number.
    const of = (count: number) => (unit ? ` ${unit}${count === 1 ? '' : 's'}` : '');
    if (low !== undefined && high !== undefined) {
      limits.push(`${low} to ${high}${of(high)}`);
    } else if (low !== undefined) {
      limits.push(`at least ${low}${of(low)}`);
    } else if (high !== undefined) {
      limits.push(`at most ${high}${of(high)}`);
    }
  };
  range(schema.minLength, schema.maxLength, 'character');
  range(schema.minimum, schema.maximum);
  range(schema.minItems, schema.maxItems, 'item');
  if (schema.default !== undefined) {
    limits.push(`${JSON.stringify(schema.default)} when left out`);
  }
  return limits;
}

/** How deep an example follows a schema before it stops, so one that contains itself ends. */
const EXAMPLE_DEPTH = 5;

/** A value that fits a schema, to show what a body looks like. Only what has to be sent. */
export function exampleOf(input: JsonSchema, document: OpenApiDocument, depth = 0): unknown {
  const { schema } = resolveSchema(splitNull(input).schema, document);
  if (schema.const !== undefined) {
    return schema.const;
  }
  if (schema.default !== undefined) {
    return schema.default;
  }
  if (schema.enum?.length) {
    return schema.enum[0];
  }
  if (schema.anyOf?.length) {
    return exampleOf(schema.anyOf[0] as JsonSchema, document, depth + 1);
  }
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'object' || schema.properties) {
    if (depth >= EXAMPLE_DEPTH) {
      return {};
    }
    const required = new Set(schema.required ?? []);
    return Object.fromEntries(
      Object.entries(schema.properties ?? {})
        .filter(([name]) => required.has(name))
        .map(([name, property]) => [name, exampleOf(property, document, depth + 1)]),
    );
  }
  if (type === 'array') {
    return schema.items && depth < EXAMPLE_DEPTH && (schema.minItems ?? 0) > 0
      ? [exampleOf(schema.items, document, depth + 1)]
      : [];
  }
  if (type === 'string') {
    if (schema.format === 'uuid') {
      return '0193a5d2-7c1e-7b3a-9f4e-2b6c8d1e5a70';
    }
    if (schema.format === 'date-time') {
      return '2026-01-15T09:30:00.000Z';
    }
    return 'text';
  }
  if (type === 'number' || type === 'integer') {
    return schema.minimum ?? 0;
  }
  if (type === 'boolean') {
    return false;
  }
  return null;
}

/** A command that calls an endpoint, to paste into a terminal. */
export function curlFor(operation: Operation, origin: string, document: OpenApiDocument): string {
  const path = operation.path.replaceAll(/\{([^}]+)\}/g, (_, name: string) => `<${name}>`);
  const lines = [`curl -X ${operation.method.toUpperCase()} '${origin}${path}'`];
  if (operation.access.kind === 'admin') {
    lines.push(
      `  -H 'Authorization: Bearer <${operation.access.sessionOnly ? 'admin token' : 'API key'}>'`,
    );
  } else if (operation.access.kind === 'viewer') {
    lines.push("  -H 'Authorization: Bearer <viewer token>'");
  }
  if (operation.body?.contentType === 'application/json') {
    const example = JSON.stringify(exampleOf(operation.body.schema, document), null, 2);
    lines.push(
      "  -H 'Content-Type: application/json'",
      `  -d '${example.replaceAll("'", "'\\''")}'`,
    );
  } else if (operation.body) {
    lines.push("  -F 'file=@<path to the file>'");
  }
  return lines.join(' \\\n');
}

export function isSuccess(status: string): boolean {
  return status.startsWith('2');
}
