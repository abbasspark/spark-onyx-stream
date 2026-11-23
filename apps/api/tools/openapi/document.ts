// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { z } from 'zod';
import { type Access, findRoutes, type Route, type RouteInput } from './routes.js';
import { type Schema, TypeSchemas } from './type-schema.js';

/** The part every address of the API starts with. */
export const API_PREFIX = 'v1';

/** What the folders of the source are called for people who read the description. */
const AREAS: Record<string, { name: string; description: string }> = {
  health: { name: 'Health', description: 'Whether the server is up.' },
  openapi: { name: 'This description', description: 'The API described for programs.' },
  'app-versions': {
    name: 'Apps',
    description: 'What an app asks first, and the oldest versions that may connect.',
  },
  auth: { name: 'Admin sign-in', description: 'Signing in to the panel, sessions and two-factor.' },
  admins: { name: 'Admins', description: 'The people who run the installation.' },
  'admin-roles': { name: 'Roles', description: 'Roles made from the permission list.' },
  'api-keys': { name: 'API keys', description: 'Keys for scripts and other systems.' },
  audit: { name: 'Audit log', description: 'Who did what in the panel.' },
  assets: { name: 'Videos', description: 'Uploaded videos and their processing.' },
  uploads: { name: 'Uploads', description: 'Resumable uploads of video files.' },
  subtitles: { name: 'Subtitles', description: 'Subtitle files of a video.' },
  jobs: { name: 'Jobs', description: 'The queue of processing work.' },
  'encoding-profiles': {
    name: 'Encoding profiles',
    description: 'The qualities videos are made in.',
  },
  storage: { name: 'Storage', description: 'Where files are kept.' },
  playback: { name: 'Playback', description: 'Signed addresses and the files players load.' },
  catalog: { name: 'Catalog', description: 'Movies, series, people, genres and collections.' },
  history: { name: 'Title history', description: 'What changed on a title, with a way back.' },
  bulk: { name: 'Bulk actions', description: 'Changes to many titles at once.' },
  metadata: { name: 'Import of details', description: 'Details and pictures from TMDB.' },
  watch: {
    name: 'Watched locations',
    description: 'Folders and buckets that import by themselves.',
  },
  home: { name: 'Page layout', description: 'The rows of the home page and the other pages.' },
  branding: { name: 'Branding', description: 'The name, logo and colour of the website.' },
  viewers: { name: 'Viewers', description: 'Viewer accounts, sign-in and profiles.' },
  watching: { name: 'Watching', description: 'Where a viewer stopped, to continue later.' },
  watchlist: { name: 'My list', description: 'Titles a viewer saved.' },
  streams: { name: 'Streams', description: 'How many devices of an account play at once.' },
  billing: { name: 'Billing', description: 'Plans, subscriptions, payments and coupons.' },
  purchases: { name: 'Purchases', description: 'Renting and buying single titles.' },
  stripe: { name: 'Stripe', description: 'Checkout and the events Stripe reports.' },
  live: { name: 'Live channels', description: 'Channels and their sources.' },
  guide: { name: 'Programme guide', description: 'What runs on a channel and when.' },
  recordings: { name: 'Recordings', description: 'Recordings of channels into the library.' },
  delivery: { name: 'Edge servers', description: 'Servers that deliver video closer to viewers.' },
  p2p: { name: 'P2P', description: 'Sharing of video between viewers.' },
  analytics: { name: 'Statistics', description: 'What is watched, and how much.' },
  stats: { name: 'Dashboard', description: 'The figures of the dashboard.' },
  events: { name: 'Live updates', description: 'Changes pushed to the panel as they happen.' },
  mail: { name: 'Email', description: 'The mail server and test messages.' },
  backups: { name: 'Backups', description: 'Backups of the database.' },
  diagnostics: { name: 'Diagnostics', description: 'What is wrong with an installation.' },
  webhooks: {
    name: 'Webhooks',
    description: 'Other systems that are told when something happens.',
  },
};

export interface BuildReport {
  operations: number;
  /** Endpoints whose answer could not be described, with where they are written. */
  undescribed: string[];
  /** Inputs described from their TypeScript type because the Zod schema could not be loaded. */
  fromTypes: string[];
  folders: string[];
  /** Endpoints for viewers and apps without a line that says what they do. */
  unsummarized: string[];
}

const PROBLEM: Schema = {
  type: 'object',
  description: 'What every error looks like.',
  properties: {
    statusCode: { type: 'number' },
    message: { type: 'string', description: 'What went wrong, in words a person can read.' },
    error: { type: 'string', description: 'The name of the status, such as "Not Found".' },
    code: {
      type: 'string',
      description: 'A fixed word for programs to act on, where there is one.',
    },
    issues: {
      type: 'array',
      description: 'On a 400: every field that was refused.',
      items: {
        type: 'object',
        properties: { field: { type: 'string' }, message: { type: 'string' } },
        required: ['field', 'message'],
      },
    },
  },
  required: ['statusCode', 'message'],
};

const problem = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Problem' } } },
});

function securityOf(access: Access): Record<string, string[]>[] {
  if (access.kind === 'public') {
    return [];
  }
  if (access.kind === 'viewer') {
    return [{ viewerSession: [] }, { viewerCookie: [] }];
  }
  return access.sessionOnly ? [{ adminSession: [] }] : [{ adminSession: [] }, { apiKey: [] }];
}

function accessText(access: Access): string {
  if (access.kind === 'public') {
    return 'Open to everyone.';
  }
  if (access.kind === 'viewer') {
    return 'For a signed-in viewer.';
  }
  const who = access.sessionOnly
    ? 'For a signed-in admin, not for API keys.'
    : 'For an admin or an API key.';
  return access.permissions.length > 0 ? `${who} Needs ${access.permissions.join(' and ')}.` : who;
}

/** Zod's own description of a schema, as it accepts input and as it hands it on. */
async function zodSchemas(input: RouteInput): Promise<{ input: Schema; output: Schema } | null> {
  if (!input.schema) {
    return null;
  }
  try {
    const module = (await import(pathToFileURL(input.schema.file).href)) as Record<string, unknown>;
    const schema = module[input.schema.exportName];
    if (!(schema instanceof z.ZodType)) {
      return null;
    }
    const describe = (io: 'input' | 'output') => {
      const { $schema: _, ...rest } = z.toJSONSchema(schema, {
        io,
        unrepresentable: 'any',
      }) as Schema;
      return rest;
    };
    const described = { input: describe('input'), output: describe('output') };
    // Definitions inside a schema would need lifting into the components: not worth it for the few.
    return JSON.stringify(described).includes('$defs') ? null : described;
  } catch {
    return null;
  }
}

/**
 * A value that is converted on arrival ("coerce") accepts anything as input,
 * which says nothing to a caller. Its type after conversion says what to send.
 */
function mergeProperties(input: Schema, output: Schema): Schema {
  const inputProperties = (input.properties ?? {}) as Record<string, Schema>;
  const outputProperties = (output.properties ?? {}) as Record<string, Schema>;
  const properties: Record<string, Schema> = {};
  for (const [name, schema] of Object.entries(inputProperties)) {
    const meaningful = Object.keys(schema).some(
      (key) => key !== 'default' && key !== 'description',
    );
    properties[name] = meaningful ? schema : { ...outputProperties[name], ...schema };
  }
  return { ...input, properties };
}

/** Reads the API from its source and describes it as an OpenAPI 3.1 document. */
export async function buildDocument(
  apiRoot: string,
  version: string,
): Promise<{ document: Schema; report: BuildReport }> {
  const configPath = path.join(apiRoot, 'tsconfig.json');
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    },
  );
  if (!parsed) {
    throw new Error(`Cannot read ${configPath}`);
  }
  const sourceRoot = path.join(apiRoot, 'src');
  const program = ts.createProgram({
    rootNames: parsed.fileNames.filter(
      (file) => file.startsWith(sourceRoot) && !file.endsWith('.spec.ts'),
    ),
    options: { ...parsed.options, noEmit: true, incremental: false },
  });
  const schemas = new TypeSchemas(program.getTypeChecker());
  const routes = findRoutes(program, sourceRoot, API_PREFIX);
  const report: BuildReport = {
    operations: 0,
    undescribed: [],
    fromTypes: [],
    folders: [],
    unsummarized: [],
  };

  /** The schema of an input and whether it has to be sent whole. */
  const describeInput = async (route: Route, input: RouteInput): Promise<Schema> => {
    const zod = await zodSchemas(input);
    if (zod) {
      return mergeProperties(zod.input, zod.output);
    }
    report.fromTypes.push(route.source);
    return schemas.of(input.type) ?? {};
  };
  const resolve = (schema: Schema): Schema => {
    const reference = typeof schema.$ref === 'string' ? schema.$ref.split('/').pop() : undefined;
    return reference ? (schemas.components.get(reference) ?? {}) : schema;
  };

  const paths: Record<string, Record<string, Schema>> = {};
  const usedIds = new Map<string, number>();
  const usedAreas = new Set<string>();

  for (const route of routes) {
    usedAreas.add(route.area);
    if (!route.summary && route.access.kind !== 'admin') {
      report.unsummarized.push(route.source);
    }
    const count = (usedIds.get(route.operationId) ?? 0) + 1;
    usedIds.set(route.operationId, count);

    const parameters: Schema[] = route.pathParameters.map((parameter) => ({
      name: parameter.name,
      in: 'path',
      required: true,
      schema:
        parameter.format === 'uuid'
          ? { type: 'string', format: 'uuid' }
          : parameter.format === 'integer'
            ? { type: 'integer' }
            : { type: 'string' },
    }));
    // A catch-all in the path is a parameter without a decorator of its own.
    for (const match of route.path.matchAll(/\{([^}]+)\}/g)) {
      const name = match[1] as string;
      if (!parameters.some((parameter) => parameter.name === name)) {
        parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });
      }
    }
    for (const name of route.queryParameters) {
      parameters.push({ name, in: 'query', required: false, schema: { type: 'string' } });
    }
    if (route.query) {
      const query = resolve(await describeInput(route, route.query));
      const required = new Set((query.required as string[] | undefined) ?? []);
      for (const [name, schema] of Object.entries(
        (query.properties ?? {}) as Record<string, Schema>,
      )) {
        const { description, ...rest } = schema;
        parameters.push({
          name,
          in: 'query',
          required: required.has(name),
          ...(typeof description === 'string' ? { description } : {}),
          schema: rest,
        });
      }
    }

    const operation: Schema = {
      operationId: count === 1 ? route.operationId : `${route.operationId}${count}`,
      tags: [AREAS[route.area]?.name ?? route.area],
      summary: route.summary || undefined,
      description: [route.description, accessText(route.access)].filter(Boolean).join(' '),
      security: securityOf(route.access),
      'x-onyx-access': route.access,
    };
    if (parameters.length > 0) {
      operation.parameters = parameters;
    }
    if (route.upload) {
      operation.requestBody = {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: { file: { type: 'string', format: 'binary' } },
              required: ['file'],
            },
          },
        },
      };
    } else if (route.body) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: await describeInput(route, route.body) } },
      };
    }

    const responses: Record<string, Schema> = {};
    const answer = route.raw ? null : schemas.of(route.returns);
    if (route.raw) {
      responses[String(route.status)] = {
        description:
          'The answer is written by the server as it goes: a file, a stream or a redirect.',
      };
    } else if (!answer || route.status === 204) {
      responses[String(route.status === 200 && !answer ? 200 : route.status)] = {
        description: 'Done. Nothing comes back.',
      };
    } else {
      if (Object.keys(answer).length === 0) {
        report.undescribed.push(route.source);
      }
      const binary = answer.format === 'binary';
      responses[String(route.status)] = {
        description: 'The answer.',
        content: binary
          ? { 'application/octet-stream': { schema: answer } }
          : { 'application/json': { schema: answer } },
      };
    }
    if (route.body || route.query) {
      responses['400'] = problem('The input was refused. "issues" names every field.');
    }
    if (route.access.kind !== 'public') {
      responses['401'] = problem('Not signed in, or the sign-in ran out.');
    }
    if (route.access.kind === 'admin') {
      responses['403'] = problem('Signed in, but not allowed to do this.');
    }
    if (route.pathParameters.length > 0) {
      responses['404'] = problem('What the address names does not exist.');
    }
    if (route.rateLimited) {
      responses['429'] = problem('Too many requests. "Retry-After" says when to try again.');
    }
    operation.responses = responses;

    paths[route.path] ??= {};
    (paths[route.path] as Record<string, Schema>)[route.method] = operation;
    report.operations += 1;
  }

  report.folders = [...usedAreas].filter((area) => !AREAS[area]).sort();
  const components = Object.fromEntries(
    [...schemas.components, ['Problem', PROBLEM] as const].sort(([a], [b]) => a.localeCompare(b)),
  );

  const document: Schema = {
    openapi: '3.1.0',
    info: {
      title: 'Spark Onyx Stream API',
      version,
      description:
        'Everything the admin panel, the viewer website and the apps do goes through this API. ' +
        'This description is produced from the source code of the server, so it says what the server does.',
      license: { name: 'AGPL-3.0-only', identifier: 'AGPL-3.0-only' },
    },
    servers: [{ url: '/', description: 'This installation' }],
    tags: Object.entries(AREAS)
      .filter(([area]) => usedAreas.has(area))
      .map(([, tag]) => tag),
    paths,
    components: {
      securitySchemes: {
        adminSession: {
          type: 'http',
          scheme: 'bearer',
          description: 'The token an admin gets by signing in.',
        },
        apiKey: {
          type: 'http',
          scheme: 'bearer',
          description: 'An API key made in the panel. It can do what its scopes allow.',
        },
        viewerSession: {
          type: 'http',
          scheme: 'bearer',
          description: 'The token a viewer gets by signing in. This is what apps send.',
        },
        viewerCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'onyx_viewer',
          description: 'The same token as a cookie. This is what the website uses.',
        },
      },
      schemas: components,
    },
  };
  return { document, report };
}
