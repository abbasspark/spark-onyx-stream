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

**Consequence:** the terms of TMDB apply to operators who use the import, including that selling access needs an agreement with TMDB. The project cannot settle that for them and says so where the import is set up. A very long series with stills may take longer than a proxy waits for an answer; the stills can be left out and added by a second run. Cast and crew are not imported, because the catalog has no people yet.

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
