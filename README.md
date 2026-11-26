# Spark Onyx Stream

Open-source, self-hosted streaming platform for video on demand and live TV, with hybrid peer-to-peer delivery.

> **Status: feature-complete for video on demand and live TV, not yet released.** The server, the admin panel, the viewer website, live channels, edges with P2P, billing, the installer and the Android apps are built, and the checks in CI pass. The Android apps have run only on emulators and the Samsung/LG app only in a desktop browser, never on a real device, ads cover video on demand only, and DRM is deferred. See the [roadmap](docs/roadmap.md) for exactly what is done and what is not.

## What it is

A complete OTT platform that you install on your own servers:

- **Media engine**: upload, transcode or remux, package to HLS, encrypt with AES-128, and deliver through your own edge servers.
- **Live**: RTMP/SRT ingest or pulled sources, copy or transcode per channel, DVR, recording and a programme guide.
- **Hybrid P2P delivery**: viewers share segments over WebRTC, with HTTP delivery always available as fallback.
- **OTT layer**: catalog (movies, series, channels), viewer accounts, profiles and parental controls, plans, rentals, coupons and prepaid codes, notifications, ads, and a themeable viewer website.
- **Apps**: Android TV, Android phones and tablets, and a web app for Samsung and LG televisions.
- **Admin panel**: manage content, servers, viewers, billing and operations in one place.
- **Operations**: one-command installer, encrypted backups, updates with rollback, and a diagnostics page.

## Architecture

A modular monolith in NestJS, plus small Go services where a single static binary matters.

| Part                                     | Technology                                        |
| ---------------------------------------- | ------------------------------------------------- |
| API, workers, live supervisor, scheduler | NestJS (one codebase, started in different roles) |
| Database                                 | PostgreSQL with Prisma                            |
| Queue and cache                          | Redis with BullMQ                                 |
| Media processing                         | FFmpeg                                            |
| Delivery                                 | Nginx                                             |
| Edge agent, tracker                      | Go                                                |
| Admin panel                              | Vite + React                                      |
| Viewer website                           | Next.js                                           |
| Android apps                             | Kotlin, Media3 (one shared core module)           |
| Samsung and LG television app            | Vite + React, packaged for Tizen and webOS        |

Repository layout:

```
apps/
  api/          NestJS (roles: api, worker, live, scheduler)
  admin/        Admin panel
  web/          Viewer website
  android/      Android TV and phone apps, with a shared core
  tv-web/       Samsung (Tizen) and LG (webOS) television app
services/
  edge-agent/   Go
  tracker/      Go
packages/
  database/     Prisma schema and migrations
  api-client/   Types generated from the API's OpenAPI description
deploy/
  compose/      Single-server installation with Docker Compose
  nginx/        Gateway configuration and the playback token check
  installer/    Install and update scripts, and the `onyx` command
  edge/         Compose file for an edge server
  mediamtx/     Live ingest configuration
  dev/          Development infrastructure
tools/
  dev-player/   Single-page player for testing the API
docs/
```

## Development setup

Requirements: Node.js 22.18 or newer (24 recommended), pnpm 12, Docker, FFmpeg. Go 1.23 for the edge agent and tracker; JDK 17 and the Android SDK for the Android apps.

```bash
cp .env.example .env        # then fill in the secrets
pnpm install
pnpm dev:infra              # starts PostgreSQL and Redis
pnpm db:generate            # generates and builds the database client
pnpm db:migrate             # creates the tables
pnpm dev                    # starts the API on http://localhost:3000/v1
```

Check that it runs: `curl http://localhost:3000/v1/health`

### Admin panel and website

```bash
pnpm dev                    # the API on http://localhost:3000
pnpm dev:admin              # the admin panel on http://localhost:5174
pnpm dev:web                # the viewer website on http://localhost:3001
```

Open http://localhost:5174. On a fresh installation the panel asks you to create the first admin. After that you can upload videos, watch them being processed, preview them and manage their jobs. See the [admin README](apps/admin/README.md).

Open http://localhost:3001 for the site viewers use. It shows the titles you published in the panel. See the [website README](apps/web/README.md).

The Android apps are built from `apps/android` (see its [README](apps/android/README.md)) and the Samsung and LG app from `apps/tv-web` (see [tv-web.md](docs/tv-web.md)).

There is also a single-page development player (`pnpm dev:player`, http://localhost:5173) for testing the API without the panel. It needs `http://localhost:5173` in `CORS_ORIGINS`.

### Run everything with Docker

To try the whole platform without installing Node.js or FFmpeg:

```bash
cd deploy/compose
./init-env.sh
docker compose up -d --build
```

Then open http://localhost:8080. See the [Compose README](deploy/compose/README.md) for updates, backups and HTTPS.

### Install on a server

One command sets up a Linux server, with HTTPS when you give it a domain that points there:

```bash
curl -fsSL https://raw.githubusercontent.com/abbasspark/spark-onyx-stream/main/deploy/installer/install.sh \
  | sudo bash -s -- --domain watch.example.com
```

See the [installer README](deploy/installer/README.md) for what it does and for the `onyx` command it brings.

The viewer website is at the root and the admin panel at `/admin/`.

## Checks

GitHub Actions runs on every push to `main` and every pull request: formatting, types, lint, unit tests and build; the API end-to-end tests against PostgreSQL and Redis; the Go services; the installer tests; the Docker image builds; and the Android unit tests and lint. Locally: `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test`.

## Documentation

Design documents are in [docs/](docs/README.md): architecture, decision log, roadmap, the design of each phase, and one document per larger feature. The [roadmap](docs/roadmap.md) says what is done and what is left.

## License

The code in this repository is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).

In short: you may use, modify and self-host it for free. If you modify it and offer it to others over a network, you must publish your modifications under the same license.

- **Commercial licensing**: if the AGPL does not fit your organization, a commercial license is planned. Open an issue to get in touch.
- **Paid add-ons**: some advanced features for larger deployments are planned as separate commercial modules that are not part of this repository.
- **Name and logo**: the license covers the code, not the brand. See [TRADEMARK.md](TRADEMARK.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. All contributors must agree to the [Contributor License Agreement](CLA.md).

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).
