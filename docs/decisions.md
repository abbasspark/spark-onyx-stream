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

## D-014 Processing: one FFmpeg run per asset, jobs recorded in the database

**Date:** 2026-11-20

- **Encoding and packaging happen in one FFmpeg process.** Its HLS muxer writes the playlists and fMP4 segments of all qualities directly, so there is no separate packaging job and no dedicated packager.
- **Jobs run through BullMQ and are mirrored in the `jobs` table**, which keeps status, progress, attempts, error and output for the panel.
- **A job only carries ids.** Everything else is read from the database when it runs.
- **Workers read and write through the storage driver.** A pool on local disk is read in place. From other pools the source is downloaded into a working directory first. Outputs are always written to the working directory and uploaded afterwards.
- **A running job is cancelled through a Redis channel** that every worker listens on. The worker ends the FFmpeg process.
- **Errors that a retry cannot fix fail at once**, for example a file without video. Other errors are retried up to three times.

**Why:** one FFmpeg run decodes the source once for all qualities and guarantees aligned segments. Keeping job history in PostgreSQL means it survives a Redis restart.

**Consequence:** the `PACKAGE` job type is unused for now. Processing on a local pool writes outputs twice, to the working directory and then to the pool. The working directory needs free space for the outputs, and for the source too when the pool is not on local disk.

## D-015 Playback: a signed token in the URL path

**Date:** 2026-11-20

- **A playback URL carries a token in its path**, in front of the file path: `/v1/media/{assetId}/{token}/hls/master.m3u8`.
- **The token is an expiry time and an HMAC-SHA256 signature** over the asset id and that time, made with `PLAYBACK_SIGNING_SECRET`.
- **One token opens every generated file of one asset** until it expires. It never opens the source file or another asset.
- **The API serves the files itself for now**, with byte ranges, through the storage driver.

**Why:** HLS playlists point to their segments with relative paths. With the token in the path, every request of a session carries it, and the playlists stored on disk never have to be rewritten per viewer. A signature can be verified without a database or a call to the API, which is what a web server or edge in front of the API needs.

**Consequence:** anyone who has a playback URL can watch until it expires, so the URLs are issued per request and are short-lived. Because the token is part of the path, a cache in front of the API must leave it out of its cache key. Serving through the API costs a database lookup per asset every 30 seconds and passes all bytes through Node, which is fine for development and small installations and is replaced by direct delivery for larger ones.
