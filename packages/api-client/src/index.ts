// SPDX-License-Identifier: AGPL-3.0-only
//
// The types of the API, for everything that talks to it.
//
// schema.d.ts is generated from the description of the API, which is itself
// produced from the source of the server. Nothing here is written by hand
// except the few helpers below, so a type cannot say something the server
// does not do. To bring it up to date after a change to the API:
//
//   pnpm openapi
import type { components, operations, paths } from './schema.js';

export type { components, operations, paths };

/** Every named type of the API: Schemas['WebhookView'], Schemas['PublicTitleDetail'], … */
export type Schemas = components['schemas'];

/** The name of an endpoint, such as "Webhooks_create". */
export type OperationId = keyof operations;

type JsonOf<Content> = Content extends { content: { 'application/json': infer Body } }
  ? Body
  : undefined;

/** What an endpoint is sent as its body. */
export type BodyOf<Id extends OperationId> = operations[Id] extends { requestBody: infer Request }
  ? JsonOf<Request>
  : undefined;

/** The query of an endpoint, after the question mark. */
export type QueryOf<Id extends OperationId> = operations[Id] extends {
  parameters: { query?: infer Query };
}
  ? Exclude<Query, undefined>
  : never;

/** The parts of the address of an endpoint, such as { id }. */
export type PathParametersOf<Id extends OperationId> = operations[Id] extends {
  parameters: { path: infer Path };
}
  ? Path
  : never;

type SuccessOf<Responses> = {
  [Status in keyof Responses]: Status extends 200 | 201 | 202 ? JsonOf<Responses[Status]> : never;
}[keyof Responses];

/** What an endpoint answers when it succeeds. */
export type ResponseOf<Id extends OperationId> = operations[Id] extends {
  responses: infer Responses;
}
  ? SuccessOf<Responses>
  : never;

/** What every error of the API looks like. */
export type Problem = Schemas['Problem'];

/** The header an app names itself in, so the server can turn away versions that are too old. */
export const CLIENT_HEADER = 'X-Onyx-Client';

/** The "code" of the answer to an app that is too old. Its status is 426. */
export const CLIENT_TOO_OLD = 'client_too_old';
