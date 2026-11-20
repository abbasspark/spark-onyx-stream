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
