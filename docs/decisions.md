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

## D-030 Details of titles are imported from TMDB, and copied

**Date:** 2026-11-21

- **One source, The Movie Database,** reached with the operator's own key. No key, no import, and nothing else changes.
- **An import is a copy.** Texts go into the title, pictures into the catalog's storage. Nothing is loaded from TMDB when viewers use the site.
- **An import adds and fills. It replaces only when told to, and never deletes.**
- **The import runs inside the request,** a few pictures at a time. There is no job for it.
- **Answers of the source are treated as untrusted:** every field is checked and cut to size, and only picture paths of TMDB's own form are downloaded, from TMDB's picture server.
- **A title remembers its source,** and the public catalog says so, so clients can show the notice TMDB asks for.

**Why:** TMDB is the one large source with a free API, seasons and episodes, artwork, and many languages. Copying keeps the site independent of it at run time and lets the operator edit everything afterwards. Importing only into what is empty makes "update" safe to press on a title someone worked on. A request is simpler than a job and fast enough: a series of eight episodes takes under a second against a local stand-in, and a long one is bounded by its stills.

**Consequence:** the terms of TMDB apply to operators who use the import, including that selling access needs an agreement with TMDB. The project cannot settle that for them and says so where the import is set up. A very long series with stills may take longer than a proxy waits for an answer; the stills can be left out and added by a second run. Cast and crew were not imported at first, because the catalog had no people; D-052 added them.

## D-031 Profiles share an account and split the watch history

**Date:** 2026-11-21

- **A profile is a name, a colour and a watch history.** It has no password and no settings of its own.
- **Every account has a main profile,** created when first needed. Existing watch history moved to it in the migration.
- **The profile in use is stored on the session,** so it is a choice per device and needs nothing from the client on each request.
- **Colours are names in the API.** Each client draws them to fit its own design.
- **"One history per account" of D-028 no longer holds.**

**Why:** a household on one account is the normal case, and a shared "Continue watching" is the first thing people complain about. Storing the choice on the session keeps every other endpoint unchanged: watch history simply works on "the profile in use", and an old client that knows nothing of profiles keeps working on the main one. A lazily created main profile needs no step in any of the places that create accounts.

**Consequence:** a profile gives no privacy from the others on the account. Profiles for children need age ratings that mean the same in every country, which the catalog does not have yet. On a shared computer, what a visitor watched joins the profile in use after sign-in, as in D-028.

## D-032 Billing starts with plans and access, before any payment provider

**Date:** 2026-11-21

- **Stripe is the first payment provider, and subscriptions are what is sold first.** Renting and buying single titles come later.
- **Each title is free or paid.** A paid title needs a running subscription. Every plan opens all paid titles.
- **The first step has no provider in it:** plans, subscriptions, the rule that decides who may watch, and access granted by an admin. Stripe is the next step and writes into the same subscriptions.
- **Whether a viewer may watch is decided by state and end time together,** at the moment of asking.
- **Prices are whole numbers of the smallest unit of one currency per installation.**
- **`billing:read` and `billing:write` are permissions of their own.**

**Why:** the rule for who may watch is the part every other part depends on, and it can be built and tested completely without a provider. Granting by hand is not a stopgap: operators who sell through resellers, take cash or give access away need it for good. A provider that only has to create and update subscriptions is small and can be replaced or joined by another. Whole numbers avoid the rounding faults of decimal prices. One currency keeps every sum on a page meaningful.

**Consequence:** until the next step, a site can show its prices and cannot take money online. Plans cannot yet differ in what they open. An installation that changes its currency after creating plans shows the same numbers in the new currency, which is wrong, and has to correct the prices by hand. Money is the operator's business: taxes, invoices and the terms of the provider are theirs to handle.

## D-033 Stripe is the authority for subscriptions paid online

**Date:** 2026-11-21

- **Payments run on Stripe's own pages:** Checkout for paying, the customer portal for the card, invoices and cancelling. No card detail reaches this application.
- **Stripe is spoken to directly over HTTP,** with a small client of the six calls needed, and one API version asked for in every request. No SDK.
- **A message from Stripe is a hint, not the truth.** On every message the subscription is read from Stripe again and recorded as it is. The return from the payment page does the same, and the scheduler asks about subscriptions whose renewal is overdue.
- **Messages are checked by their signature and handled once.** They are kept for 30 days.
- **A renewing subscription runs three days past its next payment date here.**
- **A plan is a product at Stripe with an id derived from the plan. Prices are sent with each payment** and not kept at Stripe.
- **An admin can cancel a subscription paid online, and nothing else about it.**

**Why:** Stripe's pages carry the burden of card data, of strong customer authentication and of the many ways to pay, and they stay current without work here. Reading the state again on each message removes a whole class of faults: duplicates, messages out of order, and a webhook that was down for a day all end in the same correct record. Three ways to learn of a change (the return, the message, the hourly check) mean that none of them has to be reliable alone. The days of grace exist because locking out somebody who paid is worse than a few free days for somebody who did not. A derived product id and prices sent along need no bookkeeping that could drift from Stripe. The API version is fixed because Stripe moved the billing period of a subscription to its items in 2025, and an account upgraded later must not change what this code reads.

**Consequence:** Stripe has to be reachable when a message arrives, or the message is refused and Stripe sends it again. A viewer cannot change plans while subscribed: they cancel and subscribe again. A change of price reaches new subscribers only. Each price a viewer pays is its own price object at Stripe, which Stripe's reports group by product. Changing from a test key to a live key ends the subscriptions made in test mode. Refunds, disputes, invoices and taxes are handled in Stripe. Another provider would be a second source beside `STRIPE`, with the same rule for who may watch.

## D-034 Payments are kept here as the books, and Stripe stays the place for money

**Date:** 2026-11-21

- **Every payment is a row of its own:** a paid invoice from Stripe, or money an admin writes down. Revenue is always computed from these rows.
- **A payment keeps the email address and the plan name of its day,** and outlives the account and the plan.
- **Refunds are made in Stripe and only noted here.** A payment collected by Stripe cannot be changed or deleted here.
- **A refund counts against the month of its payment.**
- **Monthly recurring revenue is computed from the subscriptions as they stand,** from the price each one carries, not from past payments.
- **Months are cut in a time zone the caller names.**
- **Recording a payment by hand does not grant access, and granting access does not record a payment.**

**Why:** an operator who also sells for cash or through resellers has no single place that knows the whole income, and Stripe's reports know only Stripe's half. Rows that are never recomputed stay true when a plan is renamed, a price changes or a viewer leaves. Moving money is where mistakes cost most, so it stays with the provider that is built for it, and this application cannot send money anywhere. Counting a refund in the month of its payment keeps each month equal to what its sales were worth in the end, which is what a small operator asks. Keeping access and money apart avoids a form that does two things and half-fails: a gift is access without money, and a late payment is money without a change of access.

**Consequence:** the figures of a past month change when one of its payments is refunded later, so they are not a ledger for tax filing: for that, the export and Stripe's own reports are the source. Fees of Stripe are not known here, so revenue is before fees. Payments in a currency other than the configured one are listed and left out of sums. An endpoint at Stripe from before this decision needs two more events, and earlier invoices are brought in with the import.

## D-035 Plans differ through packages

**Date:** 2026-11-21

- **A package is a named group of paid titles.** A title can be in several packages, a plan can name several.
- **A plan opens everything, or its packages.** "Everything" is a state of the plan, not a package that has to be kept complete.
- **A paid title in no package is opened only by plans that open everything.**
- **Whether a viewer may watch is worked out at the moment of asking** from the plan and the packages as they are then. Nothing is copied to the subscription.
- **Packages are managed with billing rights and read with catalog rights.** An editor of the catalog sorts a title into packages, as they mark it paid.
- **The website learns what a viewer's subscription opens with the session,** and which packages a paid title is in with the title, and decides the buttons itself. The API decides again when playback is asked for.

**Why:** operators think in bundles: a kids offer, a sports offer, everything. Levels, where a higher plan includes all lower ones, cannot say "sports without kids". Packages can say both, and are what live channels will be sorted into in the next phase, so one structure serves films, series and channels. Keeping "everything" as a state means a new title is in every full plan without anybody remembering to add it. Refusing by default for an unsorted title costs a click when it was meant to be open, and costs revenue when it was not: the first mistake is the cheaper one. Working access out when asked means a title moved between packages, or a plan changed, takes effect at once and cannot leave stale copies behind.

**Consequence:** changing the packages of a plan changes what its current subscribers get, including those who paid for a year: the operator has to judge that. A viewer cannot move between plans in place yet. The ids of the packages of paid titles are public, which names no title that is not public anyway. Sites without packages behave exactly as before.

## D-036 A single title can be rented or bought, beside the subscriptions

**Date:** 2026-11-21

- **Prices for renting and buying are part of a paid title.** A missing price means the title is not offered that way.
- **A purchase is a right to one title,** separate from subscriptions. A paid title is open through a plan that opens it, or through a valid purchase.
- **A title can be kept out of every plan** and is then rented or bought only.
- **A rental has two clocks:** days to start, and hours to finish from the first play, never past the first deadline. Both are settings of the installation.
- **The first play of a rental is the first playback request that the rental was needed for.** Watching through a plan starts nothing.
- **A single payment through Stripe Checkout,** recorded from the checkout itself. An invoice that belongs to no subscription is not counted.
- **A refund in full revokes the purchase.** An admin can give and take back titles by hand.
- **A series is one thing to rent or buy.**

**Why:** new releases and special titles earn more sold one by one than inside a flat price, and many operators run both models side by side. Keeping the purchase apart from the subscription keeps both rules small: one asks what the plan opens, the other whether this viewer holds this title, and either is enough. The two clocks are what viewers know from every large shop for films, so nothing has to be explained. Starting the clock only when the rental is needed spares a subscriber a rental they did not use. Recording from the checkout avoids depending on whether an account makes invoices for single payments, which is a setting at Stripe and would count a sale twice or not at all.

**Consequence:** rental times are the same for every title. Seasons and episodes cannot be sold one by one. A title that is taken off the site is gone for those who bought it too, which the page says as "for as long as it is on this site". A partial refund leaves the title with the viewer. Prices of titles are in the one currency of the installation, as the plans are.

## D-037 Live channels are pulled, passed on untouched and never given up

**Date:** 2026-11-21

- **A channel has a wanted state, set by an admin, and a reported state, set by the live process.** The database holds both. Live processes compare the wanted state with their FFmpeg processes every two seconds and when told, and hold nothing else in memory that matters.
- **One FFmpeg process per channel** reads the source and writes HLS with fMP4 segments. Video is passed on untouched and must be H.264 or HEVC. Audio that is not AAC is encoded to AAC.
- **A channel that is switched on is retried for ever,** with waits that grow to 30 seconds. "Failed" is something an admin is shown, not an end.
- **A lock in Redis per channel** decides which live process runs it. Figures of a running channel live in Redis for seconds at a time.
- **Sources are network addresses only, stored encrypted,** and shown everywhere without their secret parts.
- **Live files are delivered like video on demand:** the same token in the path, checked by the API or by the gateway, from a folder the live processes write to.
- **Changing channels is for owners and admins.**

**Why:** most channels an operator starts with already arrive in a form players take, so repackaging puts many channels on one small server, and transcoding can be added as a second way to run a channel without changing the first. Comparing a wanted state with what runs is the one design that survives every kind of failure the same way: a crashed process, a restarted server and a second live process all end in the same check. Retrying for ever is what an operator would do by hand anyway. Segment numbers taken from the clock let a restart pass for viewers as a short pause. The source is a secret because it very often is one: a stream key or an account in the address. Limiting who may enter addresses matters because the server connects to whatever it is given.

**Consequence:** viewers get the one quality the source sends, with a delay of a few segments. A source with other video cannot be used until transcoding exists. With several servers, live processes and gateway need a shared folder until edges exist. A live process that dies takes its channels down for the seconds it takes to start them again. Redis is needed for more than one live process, and for figures in the panel.

## D-038 Transcoding is a second way to run a channel, with fixed qualities

**Date:** 2026-11-22

- **Each channel is passed through or transcoded.** Passing through stays the default.
- **A transcoded channel is encoded into qualities chosen from a fixed list** of picture heights, each with a bitrate that belongs to it. Nothing is ever made larger than the source.
- **One FFmpeg process makes all qualities of a channel,** decoding the source once, with key frames at the same moments in each.
- **Software encoding with x264.** One setting for its speed applies to the installation.
- **Players open the same address either way.**

**Why:** transcoding is what makes a channel watchable on a weak connection, and the only way to use a source in a format players do not take. It is also the most expensive thing the platform does, so it has to be a choice per channel and never a surprise. A fixed list keeps a channel from being set up with numbers that cannot work, and keeps what the panel says and what the encoder does in one small table. One process per channel keeps the supervisor as it was: a channel is still one process to watch, restart and clean up after. x264 runs on every server, which matters more for a self-hosted product than the last bit of efficiency.

**Consequence:** the cost of a transcoded channel is CPU the operator has to have. A server that is too small shows it as a channel falling behind, which the panel reports but cannot fix. Bitrates cannot be tuned per channel. Graphics cards are not used. All qualities of a channel stop together when its one process does.

## D-039 Encoders push to MediaMTX, which asks the API

**Date:** 2026-11-22

- **An ingest server of its own receives pushed streams:** MediaMTX, as one more container. The platform does not speak RTMP or SRT itself.
- **One stream key per channel is the whole sign-in of an encoder.** It is the last part of the address the encoder publishes to. It is stored encrypted, to show it again, and hashed, to find the channel.
- **The ingest server asks the API before every connection.** The live process reads the stream from it over RTSP and treats the channel like a pulled one from there on.
- **The platform's own access to the ingest server uses a password made from the signing secret.**
- **A pushed channel that is switched on waits for its encoder** in a state of its own, and refuses its encoder while switched off.

**Why:** receiving RTMP and SRT from every encoder on the market is a product in itself, and MediaMTX is a well-kept one under the MIT licence that does exactly this. Putting it behind the same runner means everything built for pulled channels (pass through, transcoding, the watchdog, the panel) works for pushed ones without a second code path. A single key in the place where OBS has a field for it is what operators know from every streaming service. Asking the API on each connection keeps the keys in one place and makes switching a channel off take effect for the encoder as well. Deriving the internal password removes a setting that could only ever be wrong.

**Consequence:** one more container to run, and one more thing that can be down, though only pushed channels depend on it. The stream key appears in the paths of the ingest server and so in its log, which is why that log is not for others to read. A stream is carried twice inside the server, from the ingest server to FFmpeg. Encoders need the ports 1935 (TCP) and 8890 (UDP) open.

## D-040 Channels are sold the way titles are

**Date:** 2026-11-22

- **A channel is published or not, free or paid, and in packages,** with the meaning each has for a title.
- **One rule opens both:** a paid channel is open to a viewer whose plan opens everything or includes one of its packages.
- **Channels have their own place in the public catalog,** beside titles and not among them.
- **A channel that is off air stays listed** and says so.

**Why:** an operator thinks in offers such as "Sports" or "Kids", not in kinds of video, so a package has to be able to hold both and a plan has to open both at once. Using the rule that already exists means there is one thing to explain and one function that decides. Channels are kept apart from titles in the catalog because nearly everything else about them differs: no poster, no length, no episodes, no position to resume at, and a state that changes by the second. Listing channels that are off air keeps the lineup stable and tells a viewer that a channel exists and will be back.

**Consequence:** a channel cannot be sold on its own, only through plans. Whether a channel is on air is known to everyone who can list it. Search and the home page do not show channels yet.

## D-041 The guide is imported from XMLTV and replaced source by source

**Date:** 2026-11-22

- **Guide sources are XMLTV files at web addresses,** fetched by the scheduler every few hours. Programmes can also be entered by hand.
- **A channel is linked to a source by the id the source gives it.** Only programmes of linked channels are kept, for a window from a few hours back to two weeks ahead.
- **Each import replaces everything its source brought before,** inside one transaction. A failed import leaves the guide as it was.
- **Imported programmes are read-only.** Programmes entered by hand belong to the installation and are never touched by an import.
- **Viewers get "now" and "next" with the list of channels,** and the timetable from its own address.

**Why:** XMLTV is what guide providers and the tools around them produce, so reading it covers nearly every operator without a format of our own. Linking by the provider's id is the one piece of manual work, done once per channel, and the panel offers the ids so nobody types them from a file. Replacing a source as a whole is simple to reason about and repairs itself: whatever the provider changed, moved or withdrew is right after the next import, and there is no merge to get wrong. Keeping a window instead of the whole file keeps the table small however large the file is. Refusing edits to imported programmes avoids changes that vanish a few hours later. Sending now and next with the lineup makes the page that viewers open most cost one request.

**Consequence:** a provider's mistake reaches viewers until the provider fixes it, or the channel is unlinked and filled by hand. Two sources covering the same channel are not merged: the programme that starts first is shown. The guide is as fresh as the last import, a few hours at worst. Pictures, ratings and credits in XMLTV files are not read.

## D-042 Going back in time is a longer playlist

**Date:** 2026-11-22

- **A channel keeps what it sent for a chosen time,** from a short list of lengths up to four hours, or not at all.
- **The one playlist of the channel lists all of it.** There is no second address for the past.
- **The window lives and dies with the stream:** a restart empties it.

**Why:** a longer playlist is the whole mechanism. The same process writes it, the same files are served from the same place with the same token, and every HLS player already knows how to move through it, so pausing and rewinding work in the website, the panel and any app without code of their own. Segments carry the time they were sent, which is all "start over" needs once the guide says when a programme began. A fixed list of lengths keeps the cost in disk space something an operator chooses knowingly. Emptying the window on a restart avoids joining two runs of a stream that may differ in format, which players handle unevenly.

**Consequence:** disk use grows with the window, the bitrate and the number of qualities. The playlist of a long window is large, and is sent packed for that reason. A source that drops often makes for a window that is short in practice. More than four hours, and programmes kept for good, need recording, which is separate.

## D-043 A recording is cut from the channel's own files and becomes an asset

**Date:** 2026-11-22

- **Recordings are made by the live process that runs the channel,** from the playlist and segments it already writes for viewers. Nothing is read from the source a second time and nothing is encoded.
- **A finished recording is an ordinary asset** in the default storage pool, handed to the processing pipeline like an upload.
- **Interruptions make pieces,** which are joined at the end.

**Why:** the channel's files are the one place where the stream already exists in a clean form, with the time each segment was sent. Reading them costs almost nothing, works the same for pulled, pushed, copied and transcoded channels, and lets a recording reach back into what the channel keeps. A second connection to the source would double the load on providers that count connections and would not have the past. Making the result an asset means the library, processing, storage, encryption and titles need no knowledge of recordings: a recording is a video that came from a channel instead of an upload.

**Consequence:** a recording can only hold what the channel sent while it was on air, in the best quality the channel makes, and it is encoded again by processing when the profile asks for it. The live server needs room for a running recording. A recording is tied to the server that runs its channel until it is written to storage.

## D-044 The edge is one Go program that keeps copies itself

**Date:** 2026-11-22

- **An edge runs the edge agent and nothing else.** The agent checks tokens, keeps copies on disk and fetches what it does not have. There is no Nginx on an edge.
- **The agent connects to the main server.** It reports every ten seconds and fetches files over the same address, with the token of its edge.
- **An edge holds no state that matters.**

**Why:** the earlier plan had Nginx on edges with an agent that configures it. That makes two programs, a configuration that is written by one and read by the other, and a token check in a scripting module that has to be installed with it. Serving files from disk and fetching them over HTTP is what Go's standard library does well, with the kernel sending files directly. One program with no dependencies is easier to install on a rented server, to update and to reason about, and its behaviour can be tested as ordinary code. Connecting outwards means an edge behind a firewall or address translation works, and the main server needs no list of ways into the edges.

**Consequence:** the agent has to do well what Nginx would have done: ranges, many connections, eviction. HTTPS needs a certificate given to the agent or a proxy in front. The first viewer of a file waits until the edge has fetched it whole. Supersedes the part of the architecture that put Nginx on edges.

## D-045 Every edge has its own key, and viewers are sent by content

**Date:** 2026-11-22

- **Playback tokens for an edge are signed with a key of that edge,** made from the platform's signing secret and the edge's secret.
- **The API chooses the server when playback starts** and puts it into the address. There is no redirect and no DNS trick.
- **A video goes to the same few edges every time, a live channel to all of them by weight.**

**Why:** an edge is a rented machine somewhere, and the easiest one to break into. With a key of its own it can check its viewers' tokens without a call to the main server and without knowing anything that works elsewhere: an address made on a stolen edge opens that edge only. Choosing the server in the API keeps delivery plain HTTP that any player follows, and lets the choice use what the API knows: what is asked for, and which edges are alive. Keeping a video on few edges is what makes their copies worth having. Spread over all edges, every edge would fetch every video. Live is the opposite case: little to keep and much to carry.

**Consequence:** an address is bound to one server, so a viewer whose edge dies needs a new address. The live player gets one by itself, the film player after a click. Replacing the secret of an edge ends its viewers' sessions. Pages of the website must allow the addresses of the edges, which they learn from the API.

## D-046 The tracker speaks the WebTorrent protocol, and a swarm is named by a secret

**Date:** 2026-11-22

- **The tracker is our own Go program that speaks the protocol of WebTorrent trackers over WebSocket.**
- **The P2P layer in the player is an existing open-source library that speaks it,** P2P Media Loader (Apache-2.0), not one of our own.
- **Players need a token of the main server to connect,** and the name of a swarm is made from a secret.

**Why:** exchanging segments between browsers is a large problem of its own: choosing who to ask, falling back to HTTP in time, checking what arrives. Libraries that do it exist, are in use and are open, and they find peers through WebTorrent trackers. Speaking that protocol gives us the choice among them and nothing to invent in the player. The tracker itself is small, and writing it ourselves lets it check our tokens, keep to our limits and report its figures to the panel, which a public tracker would not. Naming a swarm with a secret answers the question a tracker cannot: whether a viewer may have this video. A viewer who is not let watch never learns the name, and without it there is no swarm to join.

**Consequence:** one external dependency in the tracker, for WebSocket. A viewer who is let watch could hand the name of a swarm to someone else, who would still need a token for the tracker and, for encrypted videos, the key. The tracker keeps everything in memory: a restart empties it, and players announce themselves again within two minutes. One tracker process serves an installation until several are built.

## D-047 What was saved is counted where it happens

**Date:** 2026-11-22

- **An edge counts what it delivered and what it fetched.** The difference is what it took off the main server.
- **A player counts what it took from servers and from other viewers,** and reports it to the site.
- **The gateway counts what the main server sends to viewers itself,** and the API reads that count.
- **The overall figure is made of these three,** each counted at its source.

**Why:** only the edge knows what it served from its copies, only the player knows which part came from another viewer, and only the gateway knows what it sent without the API hearing of it. Counting anywhere else would mean guessing. With all three, what reached viewers is their sum, and what the main server carried is its own part plus what edges fetched from it. The gateway counts while it writes its log line, in a table in shared memory, which costs a request nothing and needs no log files to be read.

**Consequence:** the part of the viewers rests on what players say, so it can be skewed by someone who wants to, and the figures are kept apart from anything that decides or bills. An installation without the gateway has no figure for the main server's own part, and is told so.

## D-048 Backups are made by the installation, encrypted, and proven to open

**Date:** 2026-11-22

- **The application makes its own backups, on a schedule that is on from the first day.** They are not left to a cron job the operator has to write.
- **A backup is the output of `pg_dump`, encrypted under a key made from `MASTER_KEY`, in a storage pool.**
- **A backup counts only after it was read back and opened.**
- **Restoring is done with a command line tool, not from the panel.**

**Why:** the installations this is built for are run by one person, and a backup that has to be set up by hand is one that is set up after the first loss. On by default costs a few megabytes a night. `pg_dump` is the tool PostgreSQL itself stands behind, across versions, and its archive can be loaded by anyone with `pg_restore`, with or without us. Storage pools already know disks and buckets, so backups can leave the server without a second mechanism. The file is encrypted because it holds every viewer's address and password hash and will be copied to places that are less guarded than the database. Reading it back is the only test that says anything: most backups that fail, fail on the day they are needed. A restore replaces the database under the running application, panel included, so the panel cannot be the thing that does it. A tool that needs only the database and the key also works on the day nothing else does.

**Consequence:** the API image carries the PostgreSQL client tools, which must be no older than the database server. The key is not in the backup, so losing `.env` loses every backup with it. The panel says so where backups are set up. Video files are outside of this and stay the operator's task. Every backup is written twice over the network when the pool is a bucket: once out, once back to check.

## D-049 The installer is a script around the Compose installation, and builds on the server

**Date:** 2026-11-22

- **The installer is one shell script that sets up the Docker Compose installation of `deploy/compose`.** It does what the README describes by hand, and nothing that cannot be done by hand.
- **It can be run again at any time and never replaces settings or secrets.**
- **HTTPS is a second Compose file with a proxy that fetches certificates,** switched on by a line in `.env`.
- **The images are built on the server.** There is no registry with published images yet.

**Why:** a second way of installing would be a second thing to keep working, and the one fewer people use would rot. With the installer on top of the Compose files, every installation looks the same inside, the documentation of one is the documentation of both, and someone who outgrows the installer loses nothing. A shell script runs on a bare server before anything else is there. Being safe to run again matters more than anything it does the first time: a build runs out of memory, a connection drops, and the answer must always be "run it again". Secrets are the one thing that cannot be made again, so the installer writes them once and stops rather than guess when data exists without them. A proxy that gets its own certificates takes away the step people skip, and as a separate file it stays out of the way of those who have a proxy already. Building on the server needs no registry, no release process and no trust in images someone else built.

**Consequence:** the first installation takes minutes and 2 GB of memory, which small servers have only with swap. Published images would take both away, and belong with releases. The project name in Compose is fixed, so a server holds one installation. The installer leans on Docker's own install script for Docker, and on the package manager of the system for three small tools.

## D-050 An update builds first, copies the database last, and goes back by itself

**Date:** 2026-11-22

- **The new version is built while the old one runs.** The site is touched only when there is something to switch to.
- **The database is copied after the application is stopped,** right before the switch.
- **An update that does not answer is undone without a question:** old files, old images, the copied database.
- **A rollback returns the database only when the update changed its structure.**
- **The copy for a rollback is made by the database server's own tools,** not by the application's backup tool.

**Why:** the person updating is often alone and not a database administrator, and the moment an update fails is the worst one to ask them anything. So the failure that is cheapest to handle has to be the common one: a build that fails costs nothing because nothing was switched. Copying the database last closes the gap an earlier copy would leave: with the copy taken before the build, minutes of sign-ups and payments would be lost on a rollback, and "nothing is lost" would be a lie. Taking the database back only when migrations ran keeps the far more common rollback, of an update that changed code alone, free of any loss. The tools in the database container fit the server by definition, where the application's own backup tool belongs to one version of the application, and a rollback is exactly the moment two versions are in play.

**Consequence:** the site is down for a minute or two per update, while the database is copied and the new version starts. There is one step back, not a history: the next update replaces what the last one kept. A rollback after an update with migrations loses what happened in between, and says so before it starts. The version before stays on disk as images until the next update. Releases with published images would make the build step a download, and are the natural next thing here.

## D-051 The installation looks at itself, says what it finds in words, and writes to the owners

**Date:** 2026-11-22

- **Every process reports in:** its roles, its version, and the room on the disks it works on. The diagnostics page is built from those reports and from what the answering process can ask itself.
- **A finding is a sentence with what to do,** not a status code. There are four kinds: fine, warning, problem, not set up.
- **The same look is taken every five minutes in the background.** The owners get an email when a problem has been there twice in a row, and once more when it is gone.
- **Whether a newer version exists is asked of GitHub,** at most every six hours, with a switch to turn it off.

**Why:** the people who run these installations are not operators with dashboards, and the questions they have are plain: is it working, and if not, what do I do. A page of green and red lights answers the first, and a sentence answers the second. The process that serves the panel cannot know about a worker on another machine, so the others have to say so themselves, and their silence is the finding. Looking only when the page is open would find problems when it is too late: a backup that has failed for a week, a disk that filled up overnight. So the look runs by itself, and email is the one channel every installation that has viewers already has. Two looks before an email, and one email per problem, because an alert that cries during every restart is switched off within a week. The check for a newer version asks a public address a public question and sends nothing, which is the least that can tell an owner that they are behind. It can still be turned off, because some installations must not call out at all.

**Consequence:** the look comes from inside, so it is blind to the installation being unreachable from outside. Alerts depend on email being set up, and the page says so when it is not. Processes of versions before this one do not report in, so the page shows them as missing until they are updated. An installation made by hand has to be told its commit to be compared.

## D-052 Movies and series are one resource with two sections, and genres and people are things of their own

**Date:** 2026-11-22

- **One table and one API resource for titles, two sections in the panel.** `/movies` and `/series` have their own lists, filters and wording. `GET /titles?type=` serves both.
- **Genres are separate from categories.** A genre is what a title is; a category is a shelf the operator arranges.
- **People are entries of the catalog,** connected to titles by credits with a kind (cast or crew), a part, and an order. An imported person keeps the id of the source and is found again by it.
- **Facts are columns of the title,** with countries, studios and keywords as lists of texts.
- **What nobody types follows the source:** rating, votes, the state of a series. Everything else an import only fills where it is empty.

**Why:** a movie and a series share nearly everything that is stored (texts, artwork, access, publishing), and splitting the table would double every query, filter and billing rule that says "title". What differs is the work: a movie is finished when its one video is there, a series is a grid that fills up over weeks. That is a difference of screens, so the split is made there. Genres were categories at first because it was the cheapest thing to do, and it mixed two meanings: an import created shelves the operator never asked for, and a shelf could not be reordered without touching what a title "is". People need their own entries because the questions asked of them cross titles: everything with this actor. Text fields on a title cannot answer that. Studios and keywords are lists of texts and not entries, because nothing is asked of a studio yet beyond showing and searching it, and a table for each would be paid for with joins on every list.

**Consequence:** the panel has one more concept to explain, genre beside category, and says so on the card. Installations that imported before this keep the categories those imports made; nothing is converted. Credits are replaced as a whole list, which is simple and right for a list edited by one person at a time, and loses the edit of whoever saves second. Studios and countries cannot be renamed in one place. The public catalog API and the website do not show genres, facts or people yet.

## D-053 Availability is a condition of every query, and extras and collections are ordered lists

**Date:** 2026-11-23

- **A title has a start and an end of being shown.** Both are part of the one rule that says what viewers see, next to "published" and "has something that plays".
- **No job publishes or unpublishes at a date.** The state of a title does not change when its date comes.
- **Extras are rows of their own** that point at videos of the library. The single trailer of a title stays what it was.
- **Collections are ordered lists of titles** with their own presentation. An imported one remembers its id at the source.

**Why:** the usual way to schedule is a job that flips the state at the right minute. Then there are two truths, the date and the state, and a job that did not run makes them disagree in the one direction that hurts: a licence has ended and the film is still up. With the dates inside the rule, there is one truth and nothing to run. It costs two comparisons per query on indexed columns. Keeping "published" separate from the dates also keeps the meaning of the button: publishing is the decision that a title is finished, the dates say when. The trailer was left alone because the website, the apps to come and the publishing checklist know it as the one video that introduces a title; turning it into the first row of a list would have changed all of them for no gain. Collections get an order and a poster because they are shown as a thing of their own, which a category, being a filter, is not.

**Consequence:** public answers are cached for a short time, so a title can appear or leave some seconds after its date. What a viewer rented does not play after the end of the title's availability; an operator who sells rentals has to set the end with that in mind. A title is in a collection once, so the same film cannot appear twice in one. Extras are not imported from the source: its trailers are videos on other sites, and the catalog only plays its own.

## D-054 Translations are rows beside a title, and fall back field by field

**Date:** 2026-11-23

- **The title keeps its texts in its own columns.** Other languages are rows in tables of their own, one per title, season or episode and language.
- **Every field falls back on its own** to the language of the catalog.
- **A language is a tag, and exists by being used.** There is no table of languages and no setting that lists them.
- **Viewers name the language in the address** (`?language=de`), not in a header.
- **The source fills a form, not the database.**

**Why:** moving every text into a translations table, the catalog's own language included, is the tidy model, and it would have turned every query that reads a name into a join and every existing installation into a migration of its texts. Almost all reads want the catalog's language, so that stays where it is cheap, and the other languages cost one extra look-up only when one is asked for. Falling back per field matches how translations are really made: the name first, the synopsis later, the episodes of season four never. A whole-row fallback would show an English synopsis as missing the moment a German name is typed. A list of allowed languages would be one more thing to set up before the first translation, and it would be wrong the day a title arrives in a language nobody listed. The language is in the address because public answers are cached, and a cache keyed by address serves the right language without knowing about headers. Texts from the source go into the form because machine-matched texts are sometimes wrong, an answer in the wrong language being the common case, and a person looking before saving is the cheap check.

**Consequence:** the slug is the same in every language, so addresses are not translated. Names of categories, genres, collections and people are not translated yet. Sorting by name and the admin's own search use the catalog's language. Two admins saving the same language of a title overwrite each other as a whole. The viewer website has no language switch yet: the API is ready for one.

## D-055 Watched locations: the name of the file is the instruction, and an admin decides what a name cannot

**Date:** 2026-11-23

- **A file says what it is by starting with its TMDB id.** With a season and an episode it is an episode, without them a movie. Nothing else is guessed from a name.
- **The importer runs with the API,** one process at a time behind a lock, and not with the scheduler.
- **Every file has a row and a state,** and each step can be repeated after a crash.
- **The original is moved to a folder `imported` by default,** only after its copy in a storage pool is whole.
- **Imports are drafts by default.** A second video for the same title waits for an admin.
- **A watched location is described like a storage pool:** the same two kinds, the same settings, the same encrypted secret.

**Why:** guessing a title from a file name is where tools of this kind go wrong: "The Office" is two series, and a remake shares its name with the original. An id is what the operator already has when they obtain a film, and typing it once is cheaper than repairing a wrong match in a published catalog. Names without an id are not thrown away and not guessed at: they are listed, and a person matches them with a search. The importer needs the catalog and the import of details, which live in the API. Loading both into the scheduler would have doubled a large part of the application there for one loop, so the loop went to where its tools are, and the lock gives the "one at a time" the scheduler role would have given. Rows with states make the work visible, which matters more here than elsewhere: an import that happens by itself and fails silently is worse than no import. Moving instead of deleting keeps the one copy the operator knows about until they have seen the result, and moving instead of leaving keeps the folder a list of what is still to do. Drafts by default, because a wrong id is easy to type and should not reach viewers by itself. Reusing the storage drivers meant a watched bucket cost a listing method and no new client.

**Consequence:** a delivery of hundreds of files comes in over time, ten per look. The API process carries the copying, which is disk and network work and little else, but it is there. Files in a bucket are moved by copy and delete, which costs time and, with some providers, money. Subtitles beside a video travel with it and are not imported yet. A folder mounted read-only imports and cannot be cleared. Whoever can write to a watched folder can add drafts to the catalog, so the folder is to be guarded like the panel.

## D-056 Actions on many titles go through the doors of one title, and translating many is a job

**Date:** 2026-11-23

- **A bulk action is the single action, repeated.** It calls the same service methods as the editor of a title, title by title, and collects what failed.
- **A selection is a list of ids or a set of filters.** The filters are those of the list, so "all that match" means what the list shows.
- **Cheap actions happen in the request,** and answer with counts and reasons. **Translating is a job** with a row, a place in its list of titles, and a runner in the API behind a lock.
- **A job fixes its titles when it is made.**
- **The log gets one line per action,** not one per title.

**Why:** a second way to publish or delete, written for speed with one statement over many rows, would be a second set of rules that drifts from the first: the checklist of publishing, the guard on deleting published titles, the place of a title in a collection. Going through the same methods costs queries and buys one behaviour. It also gives the answer its shape: per title, done, as it was, or failed with the sentence the editor would have shown. Filters as a selection are what makes "all 3,000 movies" possible without the panel loading 3,000 ids, and reusing the list's own filter means the count on screen and the titles changed cannot disagree. Translating differs in kind: each title is a request to another service, and a series is several. That does not fit a request, and a queue of the media engine would have needed the catalog and the import in the worker. So it follows the watched locations: a row for the state, a loop where its tools are, a lock for "one at a time", and a counter as the place to go on from after a crash. The titles are fixed at the start so that a job has an end and its count means something. One line in the log per action keeps the log readable; the line says how the titles were chosen and how many changed.

**Consequence:** an action on thousands of titles takes its time in one request, a few queries per title that changes, and is capped at 5,000. Titles that are as asked already cost one read for all of them. A failure in the middle leaves the titles before it changed: there is no all-or-nothing, and the answer says which is which. A translation job of a large catalog runs for a long time at the pace TMDB allows, and holds no titles locked while it does: an editor can change a title in the meantime, and what they wrote is kept unless the job was told to replace. Titles added after a job started are not part of it. The log does not name each title of an action.

## D-057 Added subtitles are files in the output and lines in the playlist, written from the database

**Date:** 2026-11-23

- **A subtitle file is converted when it arrives,** by code of our own and not by FFmpeg, into WebVTT written anew from its subtitles.
- **Adding, renaming or removing a track does not process the video.** The WebVTT file goes into the HLS output and the subtitle lines of the multivariant playlist are replaced by what the database says.
- **The converted file is kept a second time outside the output,** and every processing puts it back.
- **A file that is not Unicode is read by the language it is said to be in.**
- **The name of the file is the description** in watched locations, and the first guess in the panel.

**Why:** the first idea, running the file through FFmpeg like the tracks inside a video, would have tied a small text conversion to the worker, to a job and to minutes of waiting, and FFmpeg guesses encodings poorly: an Arabic or Russian file from an older tool comes out as noise. Reading the three common formats is little code, runs in the request, and gives an answer the uploader can act on at once: how many subtitles, read as what, or why not. Writing the file anew instead of passing it through means one clean form for players whatever came in, and nothing a file could carry along. The playlist is rewritten from the rows and not edited line by line, because then every path to a change ends the same way and a half-done change repairs itself at the next one; a test holds the rewrite to the same bytes a fresh build gives. Processing replaces the whole output, so a track living only there would vanish with the next change of an encoding profile: hence the second copy, and the step in processing that reads it. An upload that lands while a video is being processed is caught from both sides: processing looks again after it finished, and the upload publishes when the video is ready.

**Consequence:** styles, positions and colours of a subtitle file are lost, and picture subtitles (`.sub` with `.idx`, `.sup`) cannot be added. A changed playlist reaches a viewer who is already watching when their player asks for it again, which for a film is the next time they open it; edge servers and browsers may hold the old one for up to an hour. Each added track is stored twice, a few hundred kilobytes. The encoding of an old file is a guess from its language, right in the usual case and corrected by hand in the others. A track taken from the video file can be removed, and comes back with the next processing.

## D-058 The home page is a list of sections, and without any it puts itself together

**Date:** 2026-11-23

- **The home page is rows in a table,** one per section: an opening, the place of "Continue watching", or a row of titles with a source, an order, a limit and a look.
- **No section means the automatic page,** which is what the website showed before. The first section takes over the whole page; there is no mixture of the two.
- **Taking over starts from the page as it is:** the sections that reproduce it are made, not an empty page.
- **The API decides what the page shows,** also in the automatic case: which title opens it, which rows there are, where "See all" leads. The website draws what it gets.
- **Sections say what to show, not which titles,** except for picks made by hand. Titles are looked up at each request, through the filter of the public catalog.

**Why:** a new installation must have a home page before anyone has thought about one, and most small catalogs never need more than the automatic one, so it stays the default and costs nothing to keep. A switch between "automatic" and "arranged" as two modes of one page, with rules for how they blend, was considered and dropped: "the page is its sections, and without sections it is automatic" is one sentence an operator can hold in their head. Starting an arranged page from a copy of the automatic one means the first click changes nothing for viewers, and every later change is a small step from something that worked. The decisions about the opening and the rows moved from the website into the API because the same page will be drawn by the apps, and three clients each choosing a hero is three home pages. Storing a source instead of titles keeps a row true without upkeep: a "Top rated" row is right tomorrow as well. It also means the page cannot show what viewers may not see, because nothing reaches it except through the one filter everything public goes through.

**Consequence:** the answer of `GET /catalog/home` changed in two ways that a client from before has to know: a featured row of a single title is no longer sent when it would only repeat the opening, and the place of "Continue watching" comes as a row without titles. The website of this version handles both, and still draws the page of an older API. A page with many sections costs one query per section at each request, softened by the 30 seconds the answer may be cached, which is also how long a change in the panel takes to show. Headings of sections are in one language. A row of picked titles needs someone to look after it; the panel marks the picks viewers no longer get.

## D-059 Viewing statistics are counted from our own rows of plays, which hold no address

**Date:** 2026-11-23

- **A play is a row** made by the API when it hands out the addresses for playing, and filled in by reports of the player.
- **The figures are counted from these rows at the time of asking.** There are no tables of totals per day.
- **The player is not trusted:** the API limits what a report can add by the time that passed.
- **No address and no description of a browser is stored.** A visitor is a mark that changes every day; a signed-in viewer is their account.
- **It can be switched off,** and rows are deleted after two years by default.

**Why:** an operator needs to know what is watched to decide what to buy, feature and renew, and should not have to hand their viewers to an outside statistics service to find out. Making the row on the server, at the one place every play has to pass, means a play cannot be missed by a blocked script and cannot be invented without asking for a video. Reports from the player are needed for how long it played, and a number a browser sends is a number anyone can send, so each report is capped by the clock of the server. Counting from the rows instead of keeping totals keeps one source of truth and lets every question be asked later: by day in any time zone, by title, by device, how far viewers get. Totals that were added up in UTC cannot be asked for in Berlin days afterwards. The daily mark for visitors is the smallest thing that lets a household be counted once and not as fifty plays; anything that lasted longer would be a way to follow a device. Accounts are kept because the service knows its customers anyway and a viewer of three evenings is one viewer.

**Consequence:** viewers who are not signed in are counted once per day, so "viewers" over a month counts a returning visitor several times and says so. A question over a long range reads many rows: with indexes on the start of a play that is fine for hundreds of thousands of plays, and an installation with many millions will want totals per day added later, which the rows allow. Time watched depends on the player reporting: a browser that is closed hard loses up to half a minute, and a client that does not report at all leaves plays that never become views. Admins with any role can see the figures. Live channels are not counted yet. Operators in places with rules about such records have to mention it in their notice; the text for that is in the documentation.

## D-060 Every arranged page is the same builder, and a page is a value on a section

**Date:** 2026-11-23

- **The pages for movies and for series are arranged like the home page:** the same sections, the same editor, the same answer for clients.
- **Which page a section is on is a column,** not a table of pages. The pages there are, are a fixed list in the code.
- **A page that nobody arranged stays what it was:** the home page puts itself together, "Movies" and "Series" are the list. Only the first section changes a page.
- **The panel has a group "Layout"** with one entry per page.
- **The addresses of the panel's API moved** from `/home` to `/layout/{page}`.

**Why:** the request was to give other pages what the home page has, and the cheapest way to keep three builders from drifting apart is to have one. Everything that was specific to the home page turned out to be two things: which page a section belongs to, and what a page is without sections. The first became a column with a default, so the home page that installations already arranged needs no move. The second stays in one function per page. A table of pages, with names and addresses an operator makes up, is where this leads once there are pages of free content; today it would be a table of three fixed rows and an interface to edit what cannot be edited. Keeping the list in the code says honestly what there is. For "Movies" and "Series" the list of all of them is a good page already, with filters no row can replace, so it stays the default and stays linked from an arranged page. That also makes the step safe: nothing a visitor sees changes until an admin starts. One entry per page in the sidebar matches how an operator thinks ("the movies page"), and the group gives the next pages a place.

**Consequence:** the menu of the website now leads to `/movies` and `/series`, which lead on to the list while the pages are not arranged: one more hop for a visitor, and two addresses for the same list until then. A new kind of page needs a value in the list, a default, and a route on the website: little, but code. Sections are not shared between pages; the same row on two pages is made twice. The panel's API changed its addresses one release after it appeared, which only the panel used.

## D-061 The pages of categories and genres are one arrangement each, filled per category

**Date:** 2026-11-23

- **"Category pages" is one page in the builder,** and so is "Genre pages". Its sections are shown for every category, each time holding only the titles of the one that was opened.
- **The live page takes rows under its channels,** and no opening.
- **Categories and genres got addresses of their own on the website:** `/category/{slug}` and `/genre/{slug}`. While the pages are not arranged they lead on to the list.
- **In the sidebar the group "Live" moved up,** to stand right under "Catalog".

**Why:** an operator with thirty categories will not arrange thirty pages, and would not keep them alike if they did. What they want to decide is what a category page looks like; which titles fill it follows from the category. So the arrangement is a template and the category is a filter laid over every section, at the one place where the titles of a section are read. That keeps the builder, the editor and the answer for clients exactly as they are for the other pages. The price is that a single category cannot look different from the others; that can be added later as an arrangement of its own that wins over the template, without changing what is stored now. The live page is the reverse case: its own content is the point, so sections only add to it, and an opening would push the channels down the page. Addresses of their own are needed because a page is not a filter of the list, and they read better. Live is content like movies and series, so it belongs next to the catalog, before the pages that present it.

**Consequence:** a section of the template that suits large categories can stand empty for a small one; empty sections are left out, so a small category gets a short page. The panel shows the arrangement with one category at a time, chosen by the admin. Links to a category now pass through `/category/{slug}`: one more hop to the list while the pages are not arranged. The live rows hold movies and series, not channels; rows of channels are not built.

## D-062 A viewer's list is kept by the account, per profile, and holds titles

**Date:** 2026-11-23

- **"My list" is stored by the API,** one row per profile and title. The browser holds a copy, never the list itself.
- **It needs an account.** A visitor who presses the button is asked to sign in.
- **It holds titles:** a series as a whole, never an episode.
- **On a page it is a section of its own kind,** filled by the client, like "Continue watching".
- **The panel counts what stands on lists,** and compares it with what was begun.

**Why:** a list that lives in the browser is lost with the browser and is not on the television in the next room, which is where people want it. "Continue watching" keeps a copy for visitors because a position is made by watching and costs nothing to lose; a list is made on purpose, and losing one is losing work. Asking for an account at that moment is also the most natural reason a site has to ask for one. Per profile, because the profiles of a household want different things, and because that is how the watch history already works. Titles and not episodes, because "save for later" is a decision about a film or a show; where one is inside a series is what the history answers. As a section the row can be placed, renamed, scheduled or left out per page with the tools that exist, and the answer for clients stays free of anything about one viewer, so it can still be cached. The figures cost one query and tell an operator something the views cannot: what people intend to watch. A title on many lists that few began is worth featuring, or has a problem.

**Consequence:** a visitor cannot keep a list. Every card on a page now carries a button, and a signed-in page asks the API once for the ids on the list. The figures show what is on lists now, not what was once saved and removed: there is no history of a list. Saving is not a view and does not appear in the viewing statistics. The list is personal data of an account like the watch history: it is deleted with the profile or the account, and an operator's notice should mention it.

## D-063 Coupons are kept here and lowered at Stripe

**Date:** 2026-11-23

- **Coupons are made, limited and counted in this application.** Stripe is told only what a code takes off.
- **The code is entered on the website, before the payment page,** not on it.
- **For each set of terms a coupon is made at Stripe when it is first needed,** under an id that names the terms.
- **A use is a completed checkout,** written down once from the checkout itself.
- **A code made in Stripe still works** on a checkout that was opened without one of ours.

**Why:** until now a reduced price meant making a coupon in Stripe's dashboard, which an operator's staff may not have access to and which knows nothing of this site: not its plans by name, not who is a new customer here, not what a title is. Keeping coupons here puts them beside the plans they are for, under the same permissions and the same audit trail, and lets the rules be ours: for this plan only, once per viewer, only before a first payment. Entering the code before paying lets the site say what it does in its own words and show the new price where the decision is made, instead of on a page of another company at the last step. Stripe still has to do the arithmetic, because it draws up the invoice and renews the subscription for months to come, so the discount must exist there. Stripe does not let the terms of a coupon be changed. Deriving its id from the terms turns that limit into the behaviour wanted: a change here applies to new checkouts and leaves running subscriptions with what they were promised, and nothing has to be stored or kept in step. Counting a use at the completed checkout, and not when the payment page is opened, means an abandoned payment costs nobody their code. Stripe takes either a discount or its own field for codes, never both, so its field stays for checkouts without a code of ours and nothing an operator already set up there stops working.

**Consequence:** a code only works where there is a payment page: an installation without online payment can prepare coupons and cannot redeem them, and the panel says so. A payment an admin writes down by hand takes no code. Limits are checked when the payment page is opened, so the last use of a limited code can be taken twice by two viewers at the same moment. The record holds what a code took off the first payment; what it takes off later payments of a subscription shows in the payments themselves. Coupons made by this site appear in the Stripe dashboard under ids that begin with `onyx_c_`, one per change of terms. Nothing here was tried against the real Stripe yet.

## D-064 Streams are counted in the database, by what players report

**Date:** 2026-11-23

- **A stream is a row,** made when the addresses for playing are handed out and kept alive by the player every 30 seconds. It is over after 75 seconds of silence.
- **The limit is applied when playback is asked for,** per account, under a lock for that account.
- **The limit comes from the viewer, else the plan, else the installation.**
- **A device over the limit is told what plays where and may stop one of them.**
- **One device holds one place.**

**Why:** "how many are playing right now" has to be answered at the moment a device asks to play, and it has to be right when two devices ask together, so it lives where a lock can be taken: a transaction in the database with a lock per account. The same rows show an admin and the viewer what is playing, which a counter in a cache would not. Thirty seconds between reports is one small write per playing device, the same order as the reports for the viewing statistics, and it bounds how long a device that vanished blocks a place. The two are kept apart on purpose: statistics can be switched off and are kept for years, and must not decide who may watch; a stream is gone when it ends. The order of the limit follows who knows best: an operator sets a default, a plan sells more devices, and an admin settles one household without making a plan for it. Refusing the device that comes last, and letting it stop another, leaves the decision with the people of the household, who know which screen was left on; throwing out the oldest stream without asking would stop a film in another room. One place per device makes changing episodes free of any race between the old player leaving and the new one starting.

**Consequence:** every playback request of a signed-in viewer writes a row, and every playing device writes once in half a minute. A stopped device goes dark up to 30 seconds later, at its next report. Two tabs of one browser are one device: the second takes the place of the first. The limit binds players that cooperate. The signed addresses stay valid for their time, so a client that ignores the stop can play on until then; the limit is a rule for households, not protection against copying. Live channels count like videos. Limits per profile, or per kind of device, are not built.

## D-065 Admins get two-factor sign-in with standard codes, built without a library

**Date:** 2026-11-23

- **The second factor is a time-based code (TOTP)** from any authenticator app, with ten recovery codes behind it.
- **The code maths are written here,** on Node's own cryptography, and tested against the vectors of the standard.
- **It is each admin's choice, unless the installation says `ADMIN_TWO_FACTOR=required`.**
- **A code counts once,** and a wrong one counts like a wrong password.
- **Getting back in has three levels:** a recovery code, another admin, the command line.

**Why:** the panel holds the catalog, the viewers and the money, behind one password per admin. Time-based codes are the second factor every admin can have within two minutes, on a phone they already own, without a service to pay or a device to buy, and they work on a server with no internet access. The whole of it is an HMAC and a clock, forty lines that the standard gives test vectors for; a dependency for that would be one more thing to trust in the part of the application that has to be trusted most. The QR code in the panel is the one place a library is used, and it runs in the browser, where the secret is on screen anyway. Asking for the code only after the right password keeps the sign-in form silent about which accounts exist and which use a second step. Remembering the last accepted time step closes the half minute in which a code that was watched could be used again. A required mode that still lets an admin in, to one screen, means an operator can turn the rule on without first collecting everyone's phone: each admin sets it up at their next sign-in. Recovery had to be thought through before the feature, not after: codes on paper for the usual case, a colleague for the unlucky one, and for the single owner a tool that needs the server itself, which is the one thing an attacker with a stolen password does not have.

**Consequence:** security keys and passkeys (WebAuthn) are not built: stronger, and a larger piece of work. Viewers have no second factor. A code is good for about a minute and a half around its time, to forgive clocks that are off; a server whose clock is wrong by more refuses every code, so the server needs time synchronisation. An admin who can manage admins can take the second factor off a colleague, which is a way in for whoever talks them into it: the panel says so when asked to confirm, and the audit log keeps it. Sessions that exist when two-factor sign-in is switched on elsewhere are ended; a session token that is stolen afterwards still works until it expires, as before.

## D-066 Custom roles are lists of the existing permissions, and nobody hands out more than they hold

**Date:** 2026-11-23

- **A custom role is a name and a list of the permissions the code already has.** The four built-in roles stay in the code and cannot be changed.
- **An admin holds one role:** a built-in one, or one custom role.
- **The panel shows areas with three levels,** not twenty-six switches; changing an area includes seeing it.
- **Three rules of the same kind:** build a role only from your own permissions, give only a role no bigger than your own, change only an admin who may do no more than you.
- **A role's permissions are read on every request,** so a change counts at once and nobody is signed out for it.

**Why:** endpoints already declared what they need, so a role was only ever a list; letting the operator write that list is the smallest step that covers a support team, finance and live operators, without a second permission system beside the first. Keeping the built-in roles fixed means an installation can never lock itself out by editing one, and documentation that says "an editor" stays true everywhere. One role per admin keeps the answer to "what may this person do" a single list that fits on a screen; several roles per admin would need a union and an explanation. The three rules are one idea applied to the three places where permission can leak. Before custom roles, only owners and admins could manage admins, and both held everything. Now a role can hold "change admins" and little else, and without the rules its holder could create an all-powerful account, promote a colleague, or reset the password of someone above them and sign in as them. Comparing lists of permissions, not names of roles, makes the rules hold for any role an operator invents. Reading the role with the session costs nothing extra, since the admin is read on every request anyway, and it means taking a permission away works the moment it is saved, which is when it matters.

**Consequence:** permissions stay as coarse as the code makes them: a role may change the catalog or not, never "only series" or "only this channel". An admin cannot hold two roles; the mix is made as one role. A custom role with every permission equals Admin, not Owner. An admin who may manage admins and holds a small role sees colleagues with bigger roles and cannot touch them, which the panel shows by leaving their controls out. When a release adds a permission, built-in roles get it by the code and custom roles do not until someone ticks it. Deleting a role that is in use needs a decision about its holders, so it cannot be done blindly from a script.

## D-067 Categories, genres, collections and people are translated like titles, and worked on in one place

**Date:** 2026-11-23

- **Each of the four kinds gets a table of translations** beside it, like titles have: a language, and the texts of that kind. An empty text falls back to the catalog's own.
- **The panel has one page for all of them,** a language at a time: every term with its name in both languages, searchable, with the gaps on request, saved many at once.
- **Viewers get the translated names everywhere they show:** lists, the facts of a title, pages of people and collections, the cards, and rows that are called after a category, genre or collection.
- **A row heading an admin typed stays as typed.**

**Why:** a catalog read in German with "Documentary" and "Kids" above its rows is half translated, and these are the words a viewer sees first. They are few and they repeat on every page, so a little work goes a long way: a sheet that shows forty genres at once gets a language done in minutes, where forty edit dialogs would not get done at all. That is why the work happens in one place and not on each term's own form. Four tables with a real reference each, not one shared table, because a deleted genre should take its translations with it without anyone remembering to. The fallback rule is the same as for titles, so there is one thing to know: what is not translated shows in the language of the catalog, and a person whose name is written the same everywhere needs no translation at all. Names are looked up by the whole kind for categories, genres and collections, which are dozens, and by id for people, which can be thousands.

**Consequence:** the built-in row names ("New", "Top rated", "Continue watching") and headings typed in the layout builder are not translated: the first belong to a translation of the website itself, which does not exist yet, the second would need a field per language in the builder. The role of a person in a title ("Director", a character's name) stays as stored. Slugs do not change with the language, so addresses stay the same. Search on the website finds a genre or person by the name in the catalog's language only. Nothing is filled in from TMDB here, unlike for titles.

## D-068 The history of a title is a row of snapshots, compared after every change

**Date:** 2026-11-23

- **After a change, the whole title is read and compared with its last snapshot.** What differs becomes an entry; nothing differs, nothing is written.
- **The entry keeps both:** the list of changes for people to read, and the snapshot, to bring back.
- **Restoring reaches what describes a title,** not what puts it on the site: publishing, the address, videos and episodes stay as they are.
- **The newest hundred entries per title are kept.**

**Why:** a title is changed from a dozen places: its page, seven kinds of bulk action, imports, background translation, duplication, and whatever is built next. Asking each of them to describe its own change would be a dozen descriptions to keep true, and the first one forgotten would be a hole in the history. Comparing snapshots needs one sentence from each place ("something happened here, by this person") and gets the description right by construction; a change that came by a path that says nothing is not lost either, it shows with the next entry. The snapshot is what makes "bring back" honest: it restores what was, not what a list of changes implies. The line between what a restore reaches and what it leaves is the line between describing and publishing. Bringing back a synopsis cannot hurt anyone. Bringing back "draft", an old address or a video that has since been deleted takes a title off the site, breaks links or leaves it without anything to play, and an admin who wants that can do it on purpose in one click. A hundred entries is years of history for a title that is edited now and then, and bounds what a title that is edited by a script can cost.

**Consequence:** a snapshot is the whole title each time, so a series with thousands of episodes writes a large row for a small change; the limit of a hundred keeps that bounded. The comparison runs after the change, in the same request, and costs a few queries; a failure there is logged and never fails the change itself, so in the worst case an entry is missing, not a save. The entry is credited to whoever made the request that noticed the difference, which for a change that came another way is the next person. Collections are not followed: membership is the collection's business, and changes from its side would show up on titles nobody touched. Restoring replaces the cast, the genres and the languages of the title with those of then; the texts of seasons and episodes in other languages stay.

## D-069 Branding is a name, a logo, one colour and a footer, and the colour has to pass on black

**Date:** 2026-11-23

- **The panel sets what makes a site somebody's:** its name and sentence, a logo, an icon, the accent colour, and a footer line with links.
- **The website asks the API** for these with every page, through the same short-lived cache as the catalog. No restart, no build.
- **One colour, and it has to have a contrast of 4.5 to 1 against black.** A darker one is refused, with the nearest lighter shade that passes offered in its place.
- **The layout, the typeface and the black background are not settings.**
- **Kept in the settings table as one row,** with the installation's `SITE_NAME` as the name until one is set.

**Why:** an operator who installs this for their own audience cannot ship a site called "Onyx Stream" with somebody else's amber, and should not have to edit environment files and restart for a name, or rebuild a container for a logo. The name already lived in two places (one for emails, one for the website); the panel is the one place both now read. The website was designed around a single accent on black, and that is what makes branding it cheap and safe: one colour in, and every button, link, progress bar and focus ring follows. It is also what makes the contrast rule exact. The accent appears as text on black and as the fill under black text, the same two colours either way round, so a single ratio tells whether both can be read. Letting a navy through would produce a site where the Play button cannot be read, by people who trusted the software to know better. Refusing without an alternative would send them away to guess; offering the same hue, lightened until it passes, lets a brand keep its colour. A theme editor with dozens of tokens was the alternative, and it would have traded a site that always looks finished for one that can be made to look broken. The footer links exist because a site in many countries is not legal without an imprint and a privacy notice that are one click from every page.

**Consequence:** a brand whose colour is dark shows on the site as a lighter tint of it. The website depends on the API for its own header; when the API cannot be reached it shows as it ships, under the name from its environment, and a page never fails over this. Changes take up to about a minute to show, like the catalog. The icon has to be a square PNG, because that is the one format every browser shows in its tab. Pictures replaced in the branding are deleted when the change is saved, and a picture in use cannot be deleted from the catalog side. The admin panel is not branded: it is a tool, and its users know where they are.

## D-070 Webhooks are rows that a scheduler sends, signed with a secret per webhook

**Date:** 2026-11-23

- **An event becomes a row per webhook that listens to it,** written where the thing happens. A process with the scheduler role looks for rows that are due and makes the requests.
- **Every request is signed** with HMAC-SHA256 over the time and the body, with a secret that belongs to the webhook and is shown once.
- **A failed request is tried again six times over about 21 hours.** After three days in which nothing got through, the webhook is switched off.
- **Private and local addresses are allowed unless the installation says otherwise.** Cloud metadata addresses never are, and redirects are not followed.
- **Title events come from the history of a title,** not from the places that change titles.

**Why:** the alternative to rows is to make the request where the event happens, and that ties the speed and the fate of a save in the panel to a server somebody else runs. A row is written in milliseconds, survives a restart, and gives retries, the delivery log and "send again" for free, because all three are the same row read at different times. Polling every two seconds instead of a queue keeps this working with nothing but the database, which is what every installation has; `SKIP LOCKED` lets several schedulers run without sending anything twice. The signature follows the scheme receivers already know from payment providers: the time is signed with the body so a recorded request cannot be replayed later, and the secret is per webhook so one receiver's leak says nothing about another's. It is stored encrypted and not hashed, because the server has to sign with it. Retries stop after a day because an event that old is rarely still wanted, and a receiver that is gone for three days is more likely abandoned than broken; switching it off stops an installation from knocking on a dead door for years, and says so where an admin will see it. Allowing private addresses by default is the choice that fits a self-hosted product: the receiver is very often a script on the same machine or network, and whoever may add a webhook may already change every setting. An operator who thinks otherwise has one variable for it. Announcing title events from the history means the dozen places that change a title stay as they are, and a new one is covered the day it is written.

**Consequence:** delivery is at least once and a few seconds late. Receivers have to cope with a repeat, and the delivery id is there for that. Order holds within one look of the scheduler per webhook and not across retries. An event whose row cannot be written is lost without a trace beyond the log, so webhooks inform and do not account. A title change that the history does not follow is not announced either. API keys can read webhooks and switch them, and cannot make one or see a secret. The delivery log holds what was sent, which includes email addresses of viewers, for 30 days.

## D-071 The API is described by reading its code, and old apps are turned away with a status they have always known

**Date:** 2026-11-23

- **The OpenAPI description is produced from the source** of the server: endpoints from the controllers, inputs from the Zod schemas, answers from the return types, access from the marks the server itself checks.
- **It is kept in the repository and a test compares.** A change to an endpoint without a new description fails the tests.
- **Types for clients are generated from it** into a package of the workspace, by the same command.
- **Within `/v1` the server only adds.** For what cannot be added, an app names itself in a header and the operator sets the oldest version allowed; older ones get status 426 with a message and a link.

**Why:** the panel and the website each kept a copy of the API's types, written by hand, and two apps were about to add two more. Four copies drift, and the first anyone hears of it is a field that is `undefined` on somebody's television. A description that is written by hand beside the code is a fifth copy. One that is read out of the code is not a copy at all: it cannot say "a title has a tagline" when the server stopped sending one. The usual way to get there in this framework is to annotate every endpoint and turn every type into a class with decorators, which is a rewrite of three hundred endpoints and puts the same facts in two places inside one file. The server already states those facts once, as Zod schemas on the way in and TypeScript types on the way out, so the generator reads those. It costs a tool of a few hundred lines that has to understand the types the code uses, and it means the description is only as good as the types: an answer typed loosely is described loosely, which the test reports. Keeping the file in the repository makes a change to the API visible in review as a change to the description, and lets the server hand it out without doing the work at start-up. The version gate exists because an app cannot be recalled. Adding only is the rule that makes the gate rare; the gate is what makes the rule survivable on the day it has to be broken. It answers with a fixed status and code so that the very first version of an app, which knows nothing of the future, still knows what to show. The message and link belong to the operator because the app, its store page and its viewers are theirs.

**Consequence:** the description is a large generated file in the repository, and every change to an endpoint brings a change to it and to the generated types. The generator has to keep up with how the code is written: a new way of declaring an endpoint or an input that it does not know would be described poorly, and the tests say so only for what they check. Names of handlers are now names of methods in every generated client, so renaming one is a change to the API. The version gate trusts the header: it is a courtesy to honest apps, not a lock, and anyone can send a newer version than they have. An app that never sends the header is never turned away.

## D-072 A television signs in with a code, and an app is a device that outlasts its sign-ins

**Date:** 2026-11-23

- **A device without a keyboard shows a short code.** The viewer enters it on the website, where they are signed in, and says yes. The device, which keeps asking, gets its token.
- **Two secrets:** the code the viewer types, and a long one only the device holds. The token goes to the holder of the long one.
- **An app describes itself when it signs in** and becomes a device of the account, found again by an id the app made up when it was installed.
- **Browsers are not devices.** They stay sign-ins, as before.

**Why:** this is the way every large service signs a television in, and the standard behind it (the device authorization grant of OAuth) was written for exactly this. It was not taken whole: there is no client registration, no scopes and no refresh token, because there is one kind of client and its sign-in is the same token every other sign-in gets. What was kept is what makes it safe. With one secret, a code read off a screen in a shop window would be a way into somebody's account; with two, the worst a stranger can do with a code is sign that screen in to their own. Polling every few seconds is crude beside a pushed answer, and it is what a television app can do on every platform with nothing but HTTP, for the ten minutes a code lives. The alphabet is chosen for a person reading aloud from across a room, which is what really happens. A sign-in could have carried the description of its device and been enough for a list of "where you are signed in". It is not enough for what is coming: a notification is sent to a device whether or not its sign-in is the same one as last week, a download belongs to one, and "this television" should keep the name somebody gave it. That needs something that survives signing out, and an id from the installation is the only stable thing an app has. A browser has nothing like it that would not be tracking, and needs none of this.

**Consequence:** a device is what it says it is. An app could call itself a television, and the worst that follows is a wrong icon. Reinstalling an app makes a new device, and the old one stays on the list until it is the least recently used of more than thirty, or somebody removes it. The token of a device is as long-lived as any sign-in and ends the same ways. Polling costs a request every five seconds per waiting television, which the limit on asking keeps honest. Nothing tells a viewer by email that a new device was signed in; the list in their account is where they see it.

## D-073 An age limit is a number on the profile, enforced where the catalog is read

**Date:** 2026-11-24

- **Titles and channels carry the age they suit from,** a number beside the rating as written. It is read from the rating when nobody says otherwise.
- **A profile carries the oldest age it sees.** What has no age is hidden from a profile with a limit.
- **The limit is applied in one place:** the condition every read of the public catalog already goes through, fed by who the request is for.
- **A PIN is per profile, set with the password of the account.** A PIN on the main profile makes a new sign-in choose a profile first.
- **A profile with a limit cannot manage the account or spend its money.**

**Why:** ratings are text. "12", "FSK 12", "PG-13", "TV-14" and "Livre" cannot be compared, and a list of every rating system of every country would be wrong the day it was written. A number can be compared, an admin can correct it, and most ratings carry theirs in plain sight. Hiding what has no age is the uncomfortable choice and the only safe one: the alternative shows a child everything nobody got round to rating. The panel makes the cost visible, with a filter for it and a way to rate many titles at once. The limit is read in one place because a catalog is read in thirty: lists, rows, search, people, collections, "My list", "Continue watching", playback. Thirty places that each remember to ask are thirty chances to forget, and the next one written would forget. A request therefore carries its audience with it, and the one condition that decides what a viewer sees reads it. A separate "kids catalog" was the other design. It doubles what an admin maintains and still needs the age to fill it. The PIN asks for the password because a PIN that a profile could set on another would lock a parent out, and one that could be lifted without a secret would be decoration. The main profile is the default of every new sign-in, so a PIN on it would be walked around by signing in again, unless a new sign-in has to choose. Spending and managing are closed to a limited profile for the same reason a limit exists.

**Consequence:** an installation that turns limits on must rate its catalog, or children see little. One age serves every country. Signing out is always possible, so on a site that plays to visitors a limit protects the account and not the screen. A profile with a limit and no PIN on the others is a courtesy, not a lock: any other profile can be chosen. The website carries the limit in a cookie for the pages its server draws, which shapes what is shown and decides nothing. Episodes follow their series. An app that sends nothing when choosing a profile keeps working, and is told `pin_required` when a profile has one.

## D-074 The sound of a video is kept apart from its picture

**Date:** 2026-11-24

- **The qualities hold the picture only.** Every sound stream of the source, and every sound file added later, is an HLS rendition of its own.
- **This is so for every video,** also one with a single language.
- **A language is added to a video without processing its picture again.**
- **A profile carries the languages it likes,** and the player remembers what the viewer picked.

**Why:** the first design kept the main language inside the segments of the picture, as it always was, and put only the other languages beside it. HLS allows that, and a video with one language would not have changed at all. It was built and it failed in the browser: the player keeps picture and sound of such segments in one buffer, and has nothing to switch the sound in. It works with some segment formats and some players and not others, which is no ground to build apps on. Kept apart, the layout is the one every player is tested against. It also stores the sound once and no longer once per quality, lets the picture of a file be copied whatever its sound is, and makes adding a language a matter of encoding a few megabytes of sound. That last point is why it is done for single-language videos too: otherwise the first dubbed version would force the picture to be made again, which for a film is the expensive hour this design exists to avoid. Tracks that are encoded come out in stereo AAC because that plays on everything; surround survives where the stream is AAC already and the picture is copied. Preferences are two language tags per profile and nothing cleverer: "original language" as a preference needs the original language of every video to be known and right, and it is not.

**Consequence:** videos processed before this keep their sound inside the picture. They play as before, and take a second language only after being processed again once, which the panel says. A player loads two things at a time, picture and sound, where it loaded one; over HTTP/2 that costs nothing to speak of. Sharing between viewers covers what the sharing library covers of sound segments, and the rest comes from the server. A track that is encoded loses surround. An added file is stored twice: as it came, so the video can be processed again, and encoded. The player matches languages by tag, so a track without a language can only be chosen by hand, which the panel warns about.

## D-075 Intros are found by what the episodes of a season have in common

**Date:** 2026-11-24

- **A marker is a kind, a start and an end on a video.** Recap, intro, credits; one of each.
- **Markers are set by hand, or found:** the episodes of a season are compared by their sound, and what they share at the start is the intro, at the end the credits.
- **What is found is marked as detected** until an admin changes it, and never replaces what an admin set unless asked to.
- **The fingerprint is computed here,** from samples FFmpeg decodes, with nothing else installed.
- **A video counts as watched from where its credits begin.**

**Why:** a series of eight seasons has two hundred intros, and nobody marks two hundred intros by hand. The opening titles are the one thing about them that can be known without understanding the picture: the same recording, in every episode. Comparing sound finds it wherever it sits in each episode, after a cold open of any length. The fingerprint is the one Haitsma and Kalker published in 2002, the idea behind every "what song is this" service: which pitches get louder and which quieter, a few times a second. It does not change when the sound is made quieter or encoded again, which is what happens to every episode on its way here. FFmpeg can be built with a library that computes such fingerprints, and many builds lack it; requiring it would turn a feature into an installation problem. A few hundred lines do the same and are tested against sound FFmpeg really encoded. Only the first and last ten minutes are listened to: that is where intros and credits are, and it keeps a season to seconds of work. Neighbouring episodes are compared first because titles are sometimes redone between the start and the end of a season. Detection is a suggestion and says so. A wrong marker costs a viewer the scene it skips, so what a machine found is kept apart from what a person set, and a person's word stands. Markers sit on the video and not on the episode because they are moments of a timeline: the same video shown twice has the same intro. The credits as the moment a video counts as watched replace a guess, 95 percent, with what the guess was standing in for.

**Consequence:** a film, a one-off and the only episode of a season have nothing to be compared with and are marked by hand. So is every recap. Credits are found only where the end music is the same in each episode. A season whose episodes are copies of one file finds nothing, on purpose. The search reads the source files, so on object storage each is downloaded once for it. Nothing runs by itself when an episode is added: somebody presses the button, and can press it again. Players that know nothing of markers ignore them. Markers move with the video, not with the cut: replacing the source of a video with a different edit leaves markers that point at the old one.

## D-076 Similar titles are worked out from the catalog and from watching, and an editor has the last word

**Date:** 2026-11-24

- **Two titles are compared by points:** a shared collection, genres, keywords, cast and crew, and how much their audiences overlap. Type, year, studio and language only order what is alike anyway.
- **The points are given in code, from counts the database returns,** and nothing about the result is stored.
- **What viewers watch together is counted every six hours,** and a pair counts from three accounts on.
- **An editor pins titles to the front and takes titles out,** per title and in one direction.
- **The panel shows every reason,** with its points and the names of what is shared.
- **Rows for a profile come from the same list:** titles like the ones it watched last.

**Why:** an app has a place for "more like this" on every title page and at the end of every video, and an API that cannot fill it leaves each app to invent its own. The catalog already knows what makes titles alike: an editor who puts three films into a collection has said so outright, and genres, keywords and people say it less loudly. Watching says what no description does, that the people who liked one thing liked another. Most installations start with no audience and many stay small, so watching cannot be the only source, and a pair needs three accounts before it counts: below that it is noise, and it is somebody's evening. The overlap is divided by the size of both audiences because otherwise the most watched title is similar to everything. Machine learning was left out on purpose. It needs data a self-hosted site does not have and cannot explain itself, and an editor who cannot see why a title is listed cannot trust the list or fix it. Points that add up to 100 can be read, drawn as a bar and argued with. Scoring in code keeps the rule in one tested file; the database only counts what is shared, which it does well. Nothing is stored because a stored list is wrong the moment a title is published or a genre changes, and one query per title page is cheap. Pinning is one-directional because the reasons are: the sequel belongs next to the first film, and the first film is not what somebody who just finished the sequel needs.

**Consequence:** a title with no genres, keywords, people or collection has no similar titles until somebody pins one. On a small audience the watching points are all or nothing, since a few viewers are the whole overlap. The weights are constants: changing them is a change to the code. At most 400 candidates are scored per title, picked roughly by the database first, so in a very large catalog a weak match can be missed. The rows for a profile look at what it watched last, not at everything it ever watched. Viewers are not told why a title is offered.

## D-077 Players report how playback went, and a report names no viewer

**Date:** 2026-11-24

- **Every answer with playback addresses carries a place to report to,** for videos and for live channels.
- **A report holds everything counted since the playback began,** and the API keeps the largest it was told.
- **The player is not trusted:** nothing lasted longer than the time that passed, and addresses in messages are cut to their host.
- **A row says what was played, on what kind of device, from which server and with which player.** It does not say who watched.
- **Four figures are graded:** the time to start, the share of time spent waiting, playbacks that failed to start, and playbacks that broke.

**Why:** the server cannot know how watching goes. It sees requests for pieces of video and cannot tell a viewer who paused from one whose picture froze, or a tab that was closed from a player that crashed. Only the player knows, so the player has to say, and what it says has to be settled before apps exist: an app that ships without reporting never reports. Whole counts instead of changes make the last report the only one that matters, which suits a thing that is sent as the page closes and often lost. The four figures are the ones streaming services run on, with the marks they commonly hold themselves to, so an operator can compare with what is written elsewhere. Reports are kept apart from viewing statistics on purpose. Those are about people and can be turned off for that reason. These are about servers and devices, and leaving the viewer out altogether means they can stay on where the others are off, and that a list of failed playbacks can be shown to anyone who may see figures. The server a player was sent to is kept as a host name and not as a link to an edge, because the figures of an edge that was since removed still say what happened.

**Consequence:** a player that does not report is invisible here, and so is a playback that died before its first report. Nobody can be told "your playback failed yesterday": there is no way from a row to a viewer. A dishonest client can send figures that are wrong within what is possible, so these are figures for running a service, not for billing or for proof. The marks for good and poor are constants. Live channels have no time played to the end, so their waiting is measured on what was watched. Reports add one small request about twice a minute per playback.

## D-078 A notification is a row in a list first, and a push second

**Date:** 2026-11-24

- **Every notification is kept per account** and shown in a list. Pushing it to devices comes on top.
- **Browsers are reached with a key pair the installation makes itself.** The encryption and the signature are written here, on what Node brings.
- **Apps are reached through a Firebase project of the operator,** whose key is pasted in the panel, tried at once and kept encrypted.
- **A device belongs to a sign-in** and takes notifications for as long as that holds.
- **A browser may only name a known push service** as the address its messages go to.
- **New episodes and new titles are told by themselves,** a few minutes after publishing and gathered into one notification. Messages of the operator are written in the panel.
- **A viewer turns kinds off, for the account.**

**Why:** a push is not a place to keep anything. It is lost when the device is off for a day, when the viewer swipes it away unread, and for every viewer who never allowed any. A list on the account is where a notification lives, and it works on the first day with nothing set up, which matters for a platform people install themselves. Web Push needs no account anywhere: the keys are the installation's own, so browsers work out of the box. Apps are different. Google and Apple deliver only for a project registered with them, and no self-hosted platform can bring one along, so the operator brings theirs. Firebase reaches both stores' devices, which is why Apple's own service is left for later. Writing the encryption here instead of taking a library keeps a dependency out and, more to the point, makes it testable: the tests decrypt what was encrypted, the way a browser does. The address in a subscription comes from the viewer, and a server that posts to any address a visitor names is a way into the network it runs in. Push services are few and known, so only they are called. Tying a device to its sign-in makes signing out mean what a person expects, with nothing to clean up. Telling viewers when something can be watched, and not when an editor pressed a button, is what the notification promises. The wait and the gathering exist because the alternative is ten notifications for one season, and people who get ten turn all of them off.

**Consequence:** nothing was tried against a real push service or a real Firebase project: both are stood in for in the tests. Notifications are for the account, so a household gets them together, and a profile for a child has no bell. Texts are English. A notification that could not be pushed within half an hour is not pushed later. Renewing the key for browsers forgets every browser until its viewer visits again. The panel shows how many opened a message only as far as clients say so.
