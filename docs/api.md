# The API, described

Everything the admin panel, the viewer website and the apps do goes through one HTTP API. This document says how that API is described for programs, how the description is kept true, and how apps of different ages are kept apart.

## The description

The server describes its own API as an [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) document:

```
GET /v1/openapi.json
```

It is open to everyone, like the API's own existence. It lists every endpoint with what it takes, what it answers, the errors it can give and who may call it.

The same content is shown for people in the panel under **Settings > API reference**: a searchable list of every endpoint, the fields of its body and its answer level by level, and a command to try it.

### It is produced from the code

Nobody writes the description. `pnpm openapi` reads the source of the server and writes it:

- **Endpoints** come from the controllers: the method, the address, the parameters in the address.
- **What an endpoint is sent** comes from the Zod schema that validates it, so limits such as "1 to 60 characters" are the limits the server enforces.
- **What an endpoint answers** comes from the return type of its handler, followed through every type it names. Dates become text, as they do on the wire.
- **Who may call** comes from the same marks the server checks: open, for a signed-in viewer, or for an admin with certain permissions.
- **The words** are the comments above the handlers and the fields.

The result is kept in the repository at `apps/api/src/openapi/openapi.json` and served from there.

### It cannot go out of date unnoticed

`pnpm test` produces the description again and compares. When an endpoint was changed and the file was not, the test fails and says what to run. The same test fails when:

- an endpoint for viewers and apps has no line that says what it does,
- an answer cannot be described,
- a new folder with endpoints has no name for people.

So after any change to an endpoint:

```bash
pnpm openapi     # writes the description and the types
```

and commit what changed.

### Who may call

Each endpoint carries one of three marks, in the standard `security` field and in `x-onyx-access`:

| Mark     | Meaning                                            | What is sent                                                         |
| -------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| `public` | Open to everyone                                   | Nothing                                                              |
| `viewer` | A signed-in viewer                                 | `Authorization: Bearer <token>` from apps, a cookie from the website |
| `admin`  | An admin or an API key, with the permissions named | `Authorization: Bearer <token or key>`                               |

`sessionOnly: true` marks the few admin endpoints that turn API keys away, such as making a webhook.

## Types and clients

### TypeScript

`packages/api-client` (`@onyx/api-client`) holds the types of the whole API, generated from the description by the same `pnpm openapi`:

```ts
import type { BodyOf, ResponseOf, Schemas } from '@onyx/api-client';

type Title = Schemas['PublicTitleDetail'];
type NewWebhook = BodyOf<'Webhooks_create'>;
type Created = ResponseOf<'Webhooks_create'>;
```

The admin panel takes its webhook types from there. Its other types are still written by hand and move over as they are touched; the website follows the same way. A type taken from the package cannot say something the server does not do, and a change to the server that breaks the panel shows up as a type error.

### Kotlin, Swift and others

The Android and Android TV apps generate their client from the same file. Any OpenAPI 3.1 generator works; for Kotlin:

```bash
openapi-generator-cli generate \
  -i https://your-site.example/v1/openapi.json \
  -g kotlin --library jvm-retrofit2 -o client
```

The name of each endpoint (`operationId`, such as `PublicCatalog_get`) becomes the name of a method, so they are kept stable: renaming a handler renames a method in every client.

## Apps of different ages

An app on a phone or a television stays installed long after a newer one is out, and it cannot be changed from the server. Two things let old and new apps live beside each other.

### The server only adds

Within `/v1`, fields and endpoints are added and never removed or given another meaning. An app ignores fields it does not know. This rule is why most changes need nothing more.

### An app that is too old is told so

For the day a change cannot be made by adding, each app names itself in every request:

```
X-Onyx-Client: android-tv/1.4.0
```

The name, a slash, the version in numbers with dots. Under **Settings > Apps** an admin sets the oldest version of each app that may still connect. A request from an older one is answered on every address with:

```json
{
  "statusCode": 426,
  "error": "Upgrade Required",
  "code": "client_too_old",
  "minimumVersion": "1.4.0",
  "message": "Update the app from the Play Store to keep watching.",
  "updateUrl": "https://play.google.com/store/apps/details?id=tv.example"
}
```

The app shows the message and opens the link. The message and the link are the operator's own words and their own store page.

- **Requests without the header are never turned away.** Browsers, scripts and the panel do not take part.
- **An app without a rule is never turned away.** Until an operator sets a minimum, every version works.
- **A suffix is ignored.** `1.4.0-beta.2` and `1.4.0+417` count as `1.4.0`.
- **When the rules cannot be read, apps are let through.** A database that stumbles does not lock every viewer out.

Every app has to handle status `426` with code `client_too_old` from its first version. That handling is the one thing that can never be added later.

### What an app asks first

```
GET /v1/meta
```

answers with the name of the site, the version of the server, and, when the request carries `X-Onyx-Client`, whether that app is supported. Unlike every other address it also answers an app that is too old, with `supported: false` and the same message and link, so the app can show its update screen before anything else fails.

### API

| Method and path     | Purpose                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `GET /openapi.json` | Public. The description of the API                                    |
| `GET /meta`         | Public. The site, the server version, and where the asking app stands |
| `GET /app-versions` | The oldest version of each app that may connect                       |
| `PUT /app-versions` | Set all rules at once. Up to 20 apps                                  |

Reading the rules needs `settings:read`, changing them `settings:write`. Changes are written to the audit log.

## Limits

- 153 endpoints of the admin side have no line that says what they do yet; the reference shows their address in its place. The endpoints for viewers and apps all have one, and the test keeps it that way.
- Answers that a handler writes itself, such as files, streams and redirects, are marked as such and not described further.
- Uploads are described as "a form with a file". The resumable upload protocol (tus) has its own description in [phase 1](phase-1-media-engine.md).
- The description says nothing about how often an endpoint may be called, beyond marking those that answer `429`.
- There is no `/v2` and no plan for one. The rule above is meant to make it unnecessary.
