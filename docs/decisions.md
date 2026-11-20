# Decision log

Each entry records a decision, when it was made and why. A decision is changed by adding a new entry that replaces the old one. Old entries stay in the log.

## D-001 Product scope: full OTT platform

**Date:** 2026-11-20

The product is a complete OTT platform with catalog, viewer accounts, subscriptions and a viewer website. It is not only a video infrastructure API.

**Why:** the target user wants to launch a streaming service, and an infrastructure API alone would leave most of the work to them.

**Consequence:** the scope is large. The media engine is kept independent of the OTT layer so it stays usable alone.

## D-002 Single-tenant

**Date:** 2026-11-20

One installation serves one business. There is no workspace or tenant layer.

**Why:** it keeps the data model and the security model simple, and a self-hosted install belongs to one owner anyway.

## D-003 Viewer accounts are managed by the platform

**Date:** 2026-11-20

Registration, login, profiles, devices and sessions are part of the product.

**Why:** a full OTT product has to work without an external identity system.

## D-004 Standalone codebase

**Date:** 2026-11-20

The project is written from scratch and shares no code with other systems.

**Why:** clean ownership of the code and a data model designed only for this product.

## D-005 NestJS for the core, Go for edge agent and tracker

**Date:** 2026-11-20

Business logic, API, workers and orchestration are NestJS. The edge agent and the tracker are Go.

**Why:** the heavy work is done by FFmpeg and Nginx, so the orchestration language does not limit throughput. Go produces single static binaries with low memory use, which suits software installed on remote servers and services with many open connections. C++ is not used: nothing in scope needs direct libav bindings. Python is reserved for optional analysis features in later phases.

## D-006 Modular monolith

**Date:** 2026-11-20

One NestJS codebase started in different roles. No microservices.

**Why:** see [architecture.md](architecture.md).

## D-007 Open source under AGPL-3.0

**Date:** 2026-11-20

The core is published under AGPL-3.0-only.

**Why:** anyone may use and self-host it for free, and anyone who offers a modified version as a network service has to publish the changes.

**Consequence:** contributors sign a CLA so contributions can also be offered under other terms. The name and logo are covered by a trademark policy.

## D-008 Hybrid P2P, never pure P2P

**Date:** 2026-11-20

Viewers exchange HLS segments over WebRTC. HTTP delivery from the origin and edges is always available as fallback.

**Why:** pure P2P fails on startup time, seeking and rarely watched content.

**Consequence:** every rendition of an asset uses the same keyframe interval and segment length, because both adaptive bitrate switching and segment sharing depend on aligned segments.

## D-009 PostgreSQL, Prisma, Redis with BullMQ

**Date:** 2026-11-20

PostgreSQL holds all durable state and is accessed through Prisma. Redis runs the job queue, cache and pub/sub.

**Consequence:** Prisma is pinned to the 7.x line. At the time of this decision the npm `latest` tag pointed at an 8.0 release candidate, which is not used.

## D-010 HLS with fMP4 segments as the delivery format

**Date:** 2026-11-20

Assets are packaged as HLS with fragmented MP4 (CMAF) segments.

**Why:** one set of segment files can later serve both HLS and DASH, and it is the format the planned P2P layer and DRM both work with.

## D-011 Admin authentication: opaque tokens, scrypt, permissions

**Date:** 2026-11-20

- **Sessions are opaque random tokens**, sent as `Authorization: Bearer`. The database stores only a SHA-256 hash of each token. Sessions last seven days.
- **API keys work the same way** and carry a list of scopes.
- **Passwords are hashed with scrypt** from Node's standard library.
- **Endpoints declare permissions.** Roles map to permission sets, and an API key holds a subset of its creator's permissions.
- **The first owner is created through a setup endpoint** that works only while no admin exists.

**Why:**

- Opaque tokens can be revoked at once on logout, password change and deactivation. Signed tokens such as JWT stay valid until they expire.
- Storing hashes means a database leak exposes no usable credential.
- scrypt needs no native module, so nothing has to be compiled on the servers the product is installed on.
- Permissions keep endpoint rules independent of role names, so roles can change without touching controllers.

**Consequence:** `JWT_SECRET` is not used by admin authentication. It is reserved for viewer tokens in phase 2.

## D-012 Storage: pools, drivers and encrypted credentials

**Date:** 2026-11-20

- **A storage pool is one place files live**: a directory or an S3 bucket. Every asset belongs to one pool.
- **All file access goes through the `StorageDriver` interface.** The core ships a local disk driver and an S3 driver built on the AWS SDK, which also works with S3-compatible services.
- **Every driver passes the same contract test suite**, so the rest of the code can rely on identical behavior.
- **S3 secret keys are encrypted with AES-256-GCM under `MASTER_KEY`** before they are stored, and the API never returns them.
- **A fresh installation gets a local pool automatically** at `STORAGE_LOCAL_PATH`.

**Why:** processing and delivery code must not care where files are, and credentials in a database dump should be useless without the master key.

**Consequence:** losing or changing `MASTER_KEY` makes stored S3 credentials unreadable. They have to be entered again. The master key belongs in every backup plan, stored apart from the database backup.

## D-013 Uploads: tus protocol, one upload per asset

**Date:** 2026-11-20

- **Source files are uploaded with the tus resumable upload protocol**, implemented with the `@tus/server` library.
- **The upload id is the asset id.** A client that lost its connection can resume knowing only the asset.
- **Bytes are collected in a temporary directory on the API server.** When the upload is complete, the file is moved into the asset's storage pool, its SHA-256 checksum is recorded and the asset becomes `UPLOADED`.
- **The move runs after the client has its answer** and is resumed at the next start if the process stops in between.

**Why:** source files are often many gigabytes and connections drop. tus is an open protocol with client libraries for browsers and mobile platforms, so no custom client code is needed.

**Consequence:** uploads have to reach the same API server until they finish, because the collected bytes are on its disk. An installation with several API servers needs sticky routing for `/v1/uploads` or a shared temporary directory. A large file is written twice, once to the temporary directory and once to the pool.
