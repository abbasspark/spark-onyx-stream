# Architecture

Spark Onyx Stream is a modular monolith in NestJS, plus a small number of Go services that have to run as separate processes. It is not built as microservices.

## Why a modular monolith

- **The product is self-hosted.** Every extra service is one more container that can fail on someone else's server.
- **The heavy work is done by FFmpeg and Nginx.** The platform's own code orchestrates them, so splitting it into services would add network calls without adding capacity.
- **One version.** The whole product is released, installed and updated as one unit.

## Two halves, one database

| Half             | Responsibility                                        | Modules                                                                |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| **Media engine** | Files, processing, live streams, storage and delivery | assets, processing, live, storage, delivery, p2p                       |
| **OTT layer**    | What viewers see and pay for                          | catalog, viewers, profiles, devices, entitlements, billing, engagement |
| **Platform**     | Shared services                                       | auth, settings, theming, analytics, notifications, audit               |

**The dependency rule:** the OTT layer depends on the media engine, never the other way round. A catalog `Title` points to an `Asset`. An `Asset` knows nothing about titles. The media engine can therefore be used without the OTT layer.

Each module owns its tables. Other modules go through the module's service interface and never query its tables directly.

## Processes

One NestJS codebase and one Docker image, started in a role chosen by `APP_ROLE`:

| Role        | Responsibility                                                  |
| ----------- | --------------------------------------------------------------- |
| `api`       | REST API, admin panel backend, playback authorization, webhooks |
| `worker`    | Takes jobs from the queue and runs FFmpeg                       |
| `live`      | Supervises live channels and their ingest processes             |
| `scheduler` | Periodic tasks: cleanup, health checks                          |
| `all`       | Every role in one process, for development and small installs   |

A small install runs everything on one server. A larger install starts more `worker` processes on other machines, all pointing at the same PostgreSQL and Redis.

## Go services

| Service      | Why it is separate                                                           |
| ------------ | ---------------------------------------------------------------------------- |
| `edge-agent` | Runs on other servers. A single static binary needs no runtime there.        |
| `tracker`    | Holds many long-lived WebSocket connections and has to survive API restarts. |

## Infrastructure

| Component  | Use                                       |
| ---------- | ----------------------------------------- |
| PostgreSQL | All durable state                         |
| Redis      | Job queue (BullMQ), cache, pub/sub        |
| Nginx      | Serves segments and caches on edges       |
| FFmpeg     | Probing, remuxing, transcoding, packaging |

## Communication

- **Inside the monolith:** direct calls between module services, and an internal event bus where modules should stay decoupled.
- **API to workers:** BullMQ jobs over Redis. Every job also has a row in the `jobs` table, so history survives a Redis restart.
- **Main server to edge agents:** the agent opens an outbound connection to the main server. No inbound ports are needed on edges.
- **State:** PostgreSQL only. Workers and edges hold no state and can be restarted at any time.

## Rules that are never broken

1. **A crash in a worker or live process must never stop playback.** Playback depends only on Nginx, the stored segments and a token check.
2. **One version number for the whole product.** The main server refuses agents that are too old.
3. **Paths in the database are relative to a storage pool.** Moving a pool to another disk or bucket changes one setting, not every row.
4. **Secrets are never stored in plain form.** Content keys and storage credentials are encrypted with the master key. API keys are stored as hashes.

## Playback flow

1. The client asks the API to play an asset.
2. The API checks that playback is allowed. In phase 1 this is an admin session or API key. From phase 2 it also covers the viewer session, device limits, geography and entitlement.
3. The API returns a signed, short-lived manifest URL.
4. Nginx verifies the signature on every manifest and segment request, without calling the API.
5. The player loads segments over HTTP and, from phase 5, also from peers.

## Repository layout

```
apps/
  api/          NestJS application (all roles)
  admin/        Admin panel (Vite + React)
  web/          Viewer website (Next.js)
services/
  edge-agent/   Go
  tracker/      Go
packages/
  database/     Prisma schema, migrations, client
  shared/       Types, DTOs, API client
  player/       Web player with P2P integration
deploy/
  dev/          Docker Compose for development infrastructure
  installer/    Production install and update
docs/
```
