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

## D-016 The API writes the multivariant playlist

**Date:** 2026-11-20

- **`master.m3u8` is built by the API**, not taken from FFmpeg. FFmpeg still writes the media playlists and segments.
- **Bitrates are measured from the finished segments.** `BANDWIDTH` is the highest segment bitrate and `AVERAGE-BANDWIDTH` the overall one.
- **The H.264 codec string is read from the initialization segment**, and the picture size from the output itself.
- **Subtitle tracks are listed in the same playlist** before anything is uploaded.

**Why:** FFmpeg drops a quality from its playlist when the stream has no known bitrate, which made copied Matroska files unplayable. Measured values are also what players need to switch quality without stalling, and target bitrates are often far from the real ones.

**Consequence:** the playlist format is our responsibility, including future additions such as separate audio tracks. Each quality is probed once more after encoding, which costs a fraction of a second.

## D-017 AES-128 encryption with MPEG-TS segments

**Date:** 2026-11-20

- **Encryption is chosen per asset** (`NONE` or `AES_128`) and applied by FFmpeg while it writes the segments.
- **Encrypted assets use MPEG-TS segments**, all others fragmented MP4.
- **One random key per asset and processing run**, stored encrypted with `MASTER_KEY` and never written to storage.
- **The key is delivered under the signed playback path** (`…/hls/key`), referenced from the playlists with a relative address.

**Why:** FFmpeg's HLS muxer cannot encrypt fragmented MP4 with AES-128. MPEG-TS with AES-128 needs no second tool and plays in every HLS player. A relative key address keeps stored playlists identical for every viewer and puts the key behind the same token as the segments.

**Consequence:** there are two segment formats to support, and encrypted assets are slightly larger. This is protection against copying files, not DRM. Real DRM (Widevine, FairPlay, PlayReady) needs CMAF with common encryption and a packager such as Shaka Packager, which is planned as a commercial add-on behind the `EncryptionProvider` extension point. A proxy or edge in front of the API must not cache the key address.

## D-018 Admin panel: a single-page app on the API's origin

**Date:** 2026-11-20

- **The panel is a Vite and React single-page app** with React Router and TanStack Query, and plain CSS without a component library.
- **It talks to the API on its own origin.** In development Vite passes `/v1` on to the API. In production the web server in front of both does the same.
- **The session token is kept in the browser's local storage** and sent as a bearer token.
- **Lists refresh by asking again every two seconds** while something on them is changing.
- **Uploads belong to the whole panel, not to one page**, so they continue while the admin moves around.

**Why:** one origin needs no cross-origin setup and lets relative playback URLs work as they are. Bearer tokens are what API keys use too, so the API has one way to authenticate and no cross-site request forgery to defend against. Asking again is simple and good enough for one admin team. Plain CSS keeps the bundle small and avoids tying an open-source project to one design library.

**Consequence:** a script injected into the panel could read the token, so the panel must never render untrusted HTML, and the production setup should send a strict content security policy. Signing out revokes the token on the server. Live updates over a push channel can replace the repeated asking later without changing the pages.

## D-019 Two images and an Nginx gateway that checks tokens itself

**Date:** 2026-11-20

- **Two images:** `api` (the NestJS application with FFmpeg, one image for every role) and `gateway` (Nginx with the built admin panel).
- **The gateway is the only published service.** It serves the panel, passes `/v1` on to the API and serves media files from the storage volume, which it mounts read-only.
- **Playback tokens are checked in Nginx with njs**, using the same secret as the API. A unit test loads the script and compares it with the API on valid and invalid tokens.
- **What the gateway cannot serve goes to the API:** content keys of encrypted assets, and files it does not find on disk, such as assets in an S3 pool.
- **Migrations run as a one-time service** before the API starts.
- **Both containers run without root.** The panel is sent with a content security policy that allows only its own files.

**Why:** serving segments is the most frequent request by far, and Nginx sends files from disk with far less work than Node. Checking the token there keeps playback alive when the API is busy or restarting. Nginx's built-in signed-link module only supports MD5, so njs is used to keep HMAC-SHA256.

**Consequence:** the gateway does not ask the database, so playback of a deleted asset ends when its files are gone, not at the moment of deletion (see D-020). The token format now exists in two places, which the test guards. The application image is large (about 390 MB compressed) because of FFmpeg's libraries.

## D-020 Deleting an asset removes its files, and the scheduler repairs what requests left unfinished

**Date:** 2026-11-20

- **Deleting is final.** The asset is marked deleted at once, its jobs are cancelled, and a `CLEANUP` job removes the source file, the streams, the content key and their records, and gives the space back to the pool.
- **The scheduler role runs repairs every minute:** it starts the processing of uploads that were stored but never queued, and queues the cleanup of deleted assets whose files are still there. A Redis lock lets one scheduler work at a time.
- **Repairs only touch what has waited two minutes**, so they never race with a request doing the same work.
- **A finished encode no longer makes a deleted asset ready again.**

**Why:** the gateway serves files without asking the database, so removing the files is what actually ends playback. A request can fail halfway when the database or Redis is unreachable for a moment, and a system that only works when every step succeeds the first time needs manual repair.

**Consequence:** there is no restore for deleted assets. A trash with a waiting period can be added later by delaying the cleanup job. Between deletion and cleanup, usually seconds, files of the default local pool can still be fetched through the gateway with a valid playback URL.

## D-021 Admin panel design system: Tailwind and Radix components kept in the repository

**Date:** 2026-11-20

This replaces the "plain CSS without a component library" part of D-018.

- **Styling uses Tailwind CSS 4** with design tokens as CSS variables. Components use token names only, never raw colors, so the light and dark themes and any rebranding change one file.
- **Interactive components are built on Radix primitives** (dialog, menu, select, tabs, tooltip, checkbox, switch) in the shadcn/ui manner: the component code lives in `apps/admin/src/components/ui` and belongs to the project.
- **Supporting libraries:** `cmdk` for the command palette, `sonner` for messages, `lucide-react` for icons, Inter as a self-hosted font.
- **Patterns every page follows:** forms open in dialogs or side sheets, destructive actions ask through one shared confirmation dialog, results are reported with a message popup, lists show skeletons while loading and an explained empty state.

**Why:** the panel is the product's face for the people who run it, and it has to feel like a finished content management system. Radix gives correct keyboard and screen reader behavior for the hard components. Keeping the component code in the repository avoids a dependency on one design library's releases and lets the look be changed freely.

**Consequence:** the panel has more dependencies and a larger first download (about 205 kB compressed, plus the player on the asset page). The content security policy still needs `'unsafe-inline'` for styles, because Radix positions popups with inline styles. Fonts are served from the panel's own origin.

## D-022 Live updates over server-sent events

**Date:** 2026-11-20

- **The panel keeps one stream open** to `GET /v1/events` (server-sent events) while an admin is signed in.
- **Any process publishes events to a Redis channel**, and every API process passes them on to its connected panels. That is how a worker's progress reaches a browser.
- **Events are hints, not data.** They carry ids, a status and a progress number, never titles, paths or errors. The panel reads the details through the normal API, where permissions are checked as usual. Job progress is the one value shown straight from an event.
- **Each stream gets only the kinds of events its permissions allow**, is ended after 15 minutes so the session is checked again, and gets a keep-alive line every 20 seconds.
- **The panel reads the stream with `fetch`**, because the browser's `EventSource` cannot send the session token in a header.
- **When the stream is down, pages ask the server every few seconds** as before, and a badge in the top bar says so.
- **Streams are ended before the HTTP server closes**, so an open panel cannot keep the API from stopping.

**Why:** asking every two seconds from every open page costs requests whether or not anything changed and still feels late. Server-sent events are plain HTTP, pass through Nginx without extra setup and reconnect simply. WebSockets would add a second protocol for something that only flows one way.

**Consequence:** one open connection per browser tab on the API. A lost event only delays what the panel shows, so publishing never fails the work that caused it. Events are not stored: a panel that was disconnected reads everything again when it reconnects.

## D-023 The catalog is separate from the media library

**Date:** 2026-11-21

- **A title points at a video, it does not own one.** Movies, trailers and episodes link to assets in the library. Deleting a title leaves the videos alone, and one video can be used by more than one title.
- **Publishing rules live in the API**, which returns a checklist with every title. The panel shows that list and never decides on its own what is missing.
- **Nothing published can be made unplayable through the catalog:** publishing needs a ready video, a published title's video can only be replaced by a ready one, and a published title cannot be deleted before it is unpublished.
- **Artwork is public and never changes under its address.** Each upload gets a new id, so pictures can be cached for a long time by browsers and, later, by edges.
- **The kind of an uploaded picture is read from its bytes.** The file name and the type sent by the browser are not trusted.
- **Categories are one flat, ordered list.** A title can be in several.

**Why:** the library is about files and processing, the catalog is about what viewers see. Keeping them apart lets a video be re-encoded, replaced or reused without touching what is published, and lets the catalog grow (people, collections, imported metadata) without changing the media engine.

**Consequence:** a video can still be deleted in the library while a published title uses it. The title then shows as incomplete in the panel, and the public catalog API must leave such titles out. Artwork is stored only as uploaded. Resized variants are a later addition.

## D-024 The public catalog shows only what can be watched, and playback is open until accounts exist

**Date:** 2026-11-21

- **Viewers read the catalog through its own routes**, `/v1/catalog`, with their own response shapes. The admin routes and shapes are never reused for viewers.
- **One filter decides what is visible:** published, and playable right now. It is defined once and used by every public query and by the panel's "hidden" mark.
- **A title that cannot be played is hidden, not unpublished.** When its video is processed again and becomes ready, it is back without anyone touching it.
- **Public reads may be cached for 30 seconds** and are limited per client address in Redis.
- **Until viewer accounts exist, `CATALOG_PLAYBACK` is the only gate:** `open` lets anyone play published titles, `off` lets nobody.
- **"Ready" is not enough to publish.** A video must also have a stream. This closes a gap in D-023, where a video stored without processing could be published.

**Why:** separate shapes keep internal details from leaking and let the panel change freely without breaking apps. Hiding instead of unpublishing means reprocessing a video is safe and needs no follow-up. Short caching takes most read load off the API once many viewers browse, at the cost of a small delay.

**Consequence:** with the default `open`, published means public. An operator who needs paid or private viewing has to wait for viewer accounts or set `off`. The request limit counts by IP address, so many viewers behind one address share one allowance. The limits are generous for that reason and are a guard against floods, not a precise control.

## D-025 The viewer website is a separate Next.js application

**Date:** 2026-11-21

- **The site viewers use is its own application**, `apps/web`, built with Next.js. It reads only the public catalog API and has no database access.
- **Pages are rendered on the server**, with catalog answers kept for 30 seconds and shared between viewers.
- **Search and playback requests are made by the browser**, directly to the API.
- **Watch positions are stored in the browser** until viewer accounts exist.
- **The interface has its own look**, separate from the admin panel: black, one accent, the catalog's artwork as the only colour.

**Why:** title pages must be readable by search engines and show a proper preview when a link is shared, which a page built only in the browser does not give. The admin panel has neither need, so it stays the simpler Vite application it is. Keeping the website on the public API alone means it can run on another machine, and that everything a viewer can see is, by construction, what the API decided to publish.

**Consequence:** the project now has two frontend stacks to maintain. The website's server counts as one client for the API's request limit, which is why it shares cached answers and leaves search to the browser. In the Docker installation the gateway serves the website at `/` and the admin panel at `/admin` (D-026).

## D-026 One origin: the website at the root, the admin panel under /admin

**Date:** 2026-11-21

- **The gateway serves everything from one origin:** the viewer website at `/`, the admin panel at `/admin/`, the API at `/v1/`.
- **The admin panel is built for the path it is served under** (`ADMIN_BASE_PATH`). In development it stays at the root of its own port.
- **The website is its own image, `web`,** a self-contained Next.js server. It is built without any setting of the installation and reads them when it starts.
- **The website sets its own content security policy,** with a nonce that is new for every page. The stricter, fixed policy of the gateway stays on the admin panel only.
- **Requests to `/v1` that reach the website are passed on to the API at run time.** Behind the gateway that never happens. It keeps development and gateway-less setups on one origin.

**Why:** one origin needs no cross-origin setup, one certificate and one address to remember, and the root is the address viewers type. A nonce is the only way to keep inline scripts forbidden on pages that Next.js builds, since it writes small scripts into every page.

**Consequence:** the admin panel changed its address, which breaks old bookmarks once. The panel and the website share cookies and storage of one origin; today neither uses cookies, and their stored keys are prefixed (`onyx.admin.`, `onyx.web.`). Operators who want the panel on a separate address can put it behind their own proxy rule. Every page of the website is built per request, because a nonce cannot be part of a page that is built once and reused.

## D-027 Viewers are a separate kind of account

**Date:** 2026-11-21

- **Viewers have their own table, sessions, token prefix and routes.** Nothing is shared with admins except the password hashing and the sign-in throttle.
- **The website holds the session in an `HttpOnly`, `SameSite=Lax` cookie.** Apps get the same token and send it in a header.
- **Requests that change something and rely on the cookie must come from the site itself**, checked by the `Origin` header.
- **Two settings decide what the public may do:** `VIEWER_REGISTRATION` and `CATALOG_PLAYBACK`, which gains the value `viewers`.
- **Only owners and admins can manage viewers.** Editors work on content and do not see personal data.
- **No email is sent yet.** There is no verification and no "forgot password". An admin sets a new password.

**Why:** an admin account is a key to the installation and a viewer account is not. Keeping them apart means a mistake in viewer code cannot hand out admin rights, and the two can grow differently (subscriptions on one side, roles on the other). A cookie the page's scripts cannot read is the safest place for a browser session. The check of the origin closes the gap that such cookies otherwise open.

**Consequence:** sign-up tells whether an email address is taken, which can only be avoided once email verification exists. A viewer who forgets their password needs an admin. Both settings are set in the environment and need a restart, and the panel shows their values so nobody has to guess.

## D-028 Watch history lives in the account, with a copy in the browser

**Date:** 2026-11-21

- **One row per viewer and video** holds the position, the length, when it was finished and when it was last watched.
- **The API decides what "begun" and "finished" mean.** Players report raw positions.
- **Of two reports for one video the later one counts,** by the time the device noted it, never later than the server's now.
- **The website keeps reading its list from the browser.** For a signed-in viewer that list is a copy: changes go to the account as they happen, and the account's list replaces the copy when a page opens.
- **Signing in hands over what the device kept as a visitor. Signing out empties the copy.**
- **Admins with `viewers:read` can see what a viewer watched.**

**Why:** resuming on another device is what viewers expect from an account. Reading from the browser keeps pages the same for everyone when they leave the server, shows the row without waiting, and keeps working without a connection. Rules on the server mean a phone app and the website cannot disagree about what is watched. Operators need to see a viewer's history to answer support questions, and later to report what is watched.

**Consequence:** on a shared computer, what a visitor watched joins the account of whoever signs in next on it. Two devices playing the same video at once overwrite each other's position, the later one winning. There is one history per account until profiles exist. The player sends a small request about every 15 seconds for each signed-in viewer who is watching.

## D-029 Email goes through the operator's own mail server, straight from the API

**Date:** 2026-11-21

- **One setting, `SMTP_URL`, turns email on.** Any mail provider that speaks SMTP works. There is no built-in provider and no provider-specific code.
- **The API sends emails itself, in the background, with three tries.** They do not go through the job queue.
- **Links carry single-use tokens in the fragment of the address.** Only hashes are stored.
- **Confirming an address is optional by default.** `VIEWER_EMAIL_VERIFICATION=required` ties watching to it.
- **The installation refuses to start** when email is half set up, or when confirmed addresses are required without a mail server.
- **"No email is sent yet" of D-027 no longer holds.**

**Why:** SMTP is the one thing every mail service offers, so an operator is never tied to one company. Putting emails on the queue would write addresses and usable tokens into Redis and its backups; a lost email costs a viewer one more click, which is the cheaper risk. A token in the fragment stays out of proxy and server logs. Requiring confirmation by default would lock out every installation that has no mail server, which is how most start.

**Consequence:** an email that is still being retried is lost when the API restarts, and the viewer has to ask again. What the mail server said to the last email is known per API process, not across several. Emails are in English only. Whether an email reaches the inbox depends on the operator's sender address and DNS records, which the panel cannot check beyond a test email.
