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

| Command                            | What it does                            |
| ---------------------------------- | --------------------------------------- |
| `pnpm dev`                         | Starts the API in watch mode            |
| `pnpm --filter @onyx/api build`    | Compiles to `dist/`                     |
| `pnpm --filter @onyx/api test`     | Unit tests                              |
| `pnpm --filter @onyx/api test:e2e` | Endpoint tests with fake infrastructure |
| `pnpm --filter @onyx/api lint`     | Lint                                    |

The database client has to be generated and built first: `pnpm db:generate`.

## Endpoints

| Method | Path              | Purpose                                                                     |
| ------ | ----------------- | --------------------------------------------------------------------------- |
| `GET`  | `/v1/health`      | Readiness. 200 when the database and Redis are up, 503 otherwise            |
| `GET`  | `/v1/health/live` | Liveness. 200 while the process answers requests, without dependency checks |

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
  health/            Health endpoints
test/                Endpoint tests
```

## Conventions

- The project uses ES modules. Relative imports end in `.js`.
- Configuration is read only through `AppConfig`. Nothing else touches `process.env`.
- Constructor dependencies use an explicit `@Inject(...)`, so injection does not depend on emitted type metadata.
- Every source file starts with the SPDX license line.
