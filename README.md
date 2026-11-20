# Spark Onyx Stream

Open-source, self-hosted streaming platform for video on demand and live TV, with hybrid peer-to-peer delivery.

> **Status: planning stage.** There is no runnable release yet. This repository currently holds the project foundation. Everything listed under "Planned scope" is a goal, not a finished feature.

## What it will be

A complete OTT platform that you install on your own servers:

- **Media engine**: upload, transcode or remux, package to HLS/DASH, encrypt, and deliver through your own edge servers.
- **Live**: RTMP/SRT ingest, copy or transcode per channel, DVR and recording.
- **Hybrid P2P delivery**: viewers share segments over WebRTC, with HTTP delivery always available as fallback.
- **OTT layer**: catalog (movies, series, channels), viewer accounts and profiles, subscriptions, and a themeable viewer website.
- **Admin panel**: manage content, servers, viewers and billing in one place.

## Planned architecture

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

Planned repository layout:

```
apps/
  api/          NestJS (roles: api, worker, live, scheduler)
  admin/        Admin panel
  web/          Viewer website
services/
  edge-agent/   Go
  tracker/      Go
packages/
  database/     Prisma schema and migrations
  shared/       Types, DTOs, API client
  player/       Web player with P2P integration
deploy/
  installer/    Docker Compose, install and update scripts
docs/
```

## Development setup

Requirements: Node.js 22.18 or newer (24 recommended), pnpm 12, Docker, FFmpeg.

```bash
cp .env.example .env        # then fill in the secrets
pnpm install
pnpm dev:infra              # starts PostgreSQL and Redis
pnpm db:generate            # generates and builds the database client
pnpm db:migrate             # creates the tables
pnpm dev                    # starts the API on http://localhost:3000/v1
```

Check that it runs: `curl http://localhost:3000/v1/health`

### Trying it in a browser

A small development page lets you sign in, upload a video, watch it being processed and play the result:

```bash
pnpm dev:player             # serves the page on http://localhost:5173
```

Create the first admin once, as described in the [API README](apps/api/README.md#first-run), then open the page and sign in. The page is a development tool and is replaced by the admin panel.

The API covers uploads, processing and playback. The admin panel and viewer website are not scaffolded yet. See the [roadmap](docs/roadmap.md).

## Documentation

Design documents are in [docs/](docs/README.md): architecture, decision log, roadmap and the phase 1 design.

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
