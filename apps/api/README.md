# @onyx/api

NestJS application. One codebase, started in different roles through `APP_ROLE`:

| Role        | Responsibility                                                  |
| ----------- | --------------------------------------------------------------- |
| `api`       | REST API, admin panel backend, playback authorization, webhooks |
| `worker`    | Runs processing jobs with FFmpeg                                |
| `live`      | Supervises live channels                                        |
| `scheduler` | Periodic tasks                                                  |

`APP_ROLE` accepts `all`, one role, or a comma-separated list such as `api,scheduler`. A process without the `api` role starts no HTTP server.

## Commands

Run from the repository root unless noted.

| Command                         | What it does                 |
| ------------------------------- | ---------------------------- |
| `pnpm dev`                      | Starts the API in watch mode |
| `pnpm --filter @onyx/api build` | Compiles to `dist/`          |
| `pnpm --filter @onyx/api lint`  | Lint                         |

The database client has to be generated and built first: `pnpm db:generate`.

Processing needs FFmpeg and ffprobe on the machine that runs the `worker` role, for example `brew install ffmpeg` on macOS or `apt install ffmpeg` on Debian and Ubuntu.

## Endpoints

The full list with status is in [docs/phase-1-media-engine.md](../../docs/phase-1-media-engine.md#api-endpoints). Built so far: health, first-run setup, sign-in and sign-out, password change, admin management, API keys, the audit log, storage pools, assets, resumable uploads, the processing pipeline, jobs and encoding profiles.

Every endpoint needs credentials unless its controller or handler is marked `@Public()`.

## First run

With the API running and no admin in the database, create the owner:

```bash
curl -X POST http://localhost:3000/v1/auth/setup \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","displayName":"Your Name","password":"at-least-12-characters"}'
```

Then sign in to get a session token:

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"at-least-12-characters"}'
```

Send the token on later requests as `Authorization: Bearer <token>`.

## Tests

| Kind       | Command                        | Needs                                        |
| ---------- | ------------------------------ | -------------------------------------------- |
| Unit       | `pnpm --filter @onyx/api test` | Nothing                                      |
| End-to-end | `pnpm test:e2e`                | A test database for the authentication suite |

The authentication, storage pool, upload and processing suites run against a real PostgreSQL database and are skipped when `TEST_DATABASE_URL` is not set. They delete data in that database, so it must be a separate database. Prepare it once, and again after every new migration:

```bash
docker compose -f deploy/dev/docker-compose.yml exec postgres createdb -U onyx onyx_test
DATABASE_URL="postgresql://onyx:<your password>@localhost:5432/onyx_test" pnpm --filter @onyx/database migrate:deploy
```

The first command fails harmlessly if the database already exists.

The processing suite also needs FFmpeg and is skipped without it. It generates its own test videos.

The S3 driver tests are part of the unit test command and are skipped unless `TEST_S3_ENDPOINT` and the other `TEST_S3_*` values are set in `.env`. They need an existing bucket on any S3-compatible service.

## Structure

```
src/
  main.ts            Loads and validates configuration, starts the process for its roles
  app.module.ts      Composes modules according to the roles
  config/            Environment schema, typed AppConfig
  roles/             Role parsing and the per-role modules
  database/          Prisma client provider
  redis/             Shared Redis client
  queue/             BullMQ configuration and queue names
  common/            Validation pipe, pagination, database error helpers
  crypto/            Encryption of stored secrets with the master key
  auth/              Sign-in, sessions, guard, permissions, password hashing, tokens
  admins/            Admin management and its rules
  api-keys/          API key management and authentication
  audit/             Audit log
  storage/           Storage driver interface, local and S3 drivers, storage pools
  assets/            Asset records and their API
  uploads/           Resumable uploads with the tus protocol
  encoding-profiles/ Encoding profiles and the default ladder
  jobs/              Job records, queueing and the jobs API
  processing/        Pipeline orchestration, FFmpeg runner, media steps, queue worker
  health/            Health endpoints
test/                End-to-end tests
```

## Conventions

- The project uses ES modules. Relative imports end in `.js`.
- Configuration is read only through `AppConfig`. Nothing else touches `process.env`.
- Constructor dependencies use an explicit `@Inject(...)`, so injection does not depend on emitted type metadata.
- Every source file starts with the SPDX license line.
- New endpoints are protected by default. Declare what they need with `@RequirePermissions(...)`, and add `@AdminSessionOnly()` when an API key must not be able to call them.
- Request input is validated with a Zod schema through `ZodValidationPipe`.
