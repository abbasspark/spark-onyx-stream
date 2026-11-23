# Phase 1: media engine core

Phase 1 delivers video on demand from end to end: an admin uploads a file, the platform processes it, and the result plays in a browser through a signed URL.

## In scope

- Admin login, roles, API keys, audit log
- Storage pools on local disk and S3-compatible storage
- Resumable upload
- Probe, decision engine, remux, transcode, HLS packaging
- Thumbnails and seek-bar sprites
- Optional AES-128 encryption
- Signed playback URLs
- Basic admin panel: assets, upload, jobs, preview player

## Out of scope for phase 1

Live streams, catalog, viewer accounts, billing, edge servers, P2P, DRM, multi-audio selection in the panel. The schema already stores audio and subtitle tracks so they are not lost.

## Data model

Defined in [`packages/database/prisma/schema.prisma`](../packages/database/prisma/schema.prisma).

| Area         | Models                                                                            |
| ------------ | --------------------------------------------------------------------------------- |
| Admin access | `AdminUser`, `ApiKey`, `AuditLog`, `Setting`                                      |
| Storage      | `StoragePool`                                                                     |
| Assets       | `Asset`, `Rendition`, `AudioTrack`, `SubtitleTrack`, `Thumbnail`, `EncryptionKey` |
| Encoding     | `EncodingProfile`, `EncodingProfileRendition`                                     |
| Processing   | `Job`                                                                             |

## Asset lifecycle

```
UPLOADING -> UPLOADED -> PROCESSING -> READY
                              |
                              +-----> FAILED

any state -> DELETED
```

## Processing pipeline

Processing starts by itself when an upload is complete. Each step is a job.

| Step | Job type     | What it does                                                                                                         |
| ---- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| 1    | `PROBE`      | Reads the file with ffprobe, checks that it is a usable video, samples its keyframes and chooses the processing mode |
| 2a   | `REMUX`      | Copy mode: repackages the source streams into HLS without re-encoding                                                |
| 2b   | `TRANSCODE`  | Transcode mode: encodes every quality of the encoding profile and writes HLS, in one FFmpeg run                      |
| 3    | `THUMBNAILS` | Saves a poster picture. Runs alongside step 2                                                                        |

The asset becomes `READY` when step 2 finishes. A failed thumbnail job does not affect the asset.

### Decision engine

The mode can be forced when the asset is created or reprocessed. Otherwise the source is copied when all of these hold, and transcoded when any does not:

- the video codec is H.264 with 8-bit 4:2:0 color,
- every audio stream is AAC, or there is no audio,
- the video is not stored rotated,
- keyframes in the first 60 seconds are at most one segment length apart.

The reason for the choice is stored in the output of the probe job.

`PASSTHROUGH` is never chosen automatically. It marks the asset ready without producing anything, for files that are served unchanged.

Copy mode produces a single quality, so there is no adaptive bitrate.

### What is rejected

The probe step fails the asset at once, without retries, when the file has no video stream, is a text file or a picture, or has no playable duration. FFmpeg would otherwise open a text file as "terminal art" and encode it.

### Transcoding rules

- Qualities taller than the source are left out. Nothing is upscaled. A source smaller than every quality is encoded once at its own height.
- Every quality gets keyframes at the same times, with scene-change keyframes switched off, so segments line up across qualities.
- The default profile has 1080p, 720p, 480p and 360p in H.264 with AAC audio, 4-second segments and a keyframe every 2 seconds.
- Encoding uses the CPU (libx264). Hardware encoders can be added behind the same command builder later.
- One audio stream is used: the default one, or the first.

### Job handling

- BullMQ runs the jobs. The `jobs` table mirrors each one with status, progress, attempts, error and output.
- A failed attempt is retried with growing delays, up to three attempts. Errors a retry cannot fix fail at once.
- Progress comes from FFmpeg's own progress output and is written at most every two seconds.
- A waiting job is cancelled by taking it off the queue. A running job is signalled through Redis, and its worker ends the FFmpeg process and removes the working files.
- When a worker dies, BullMQ notices the stalled job and another worker takes it.
- A failed or cancelled job can be retried, which creates a new job. An asset can be reprocessed, which removes its earlier outputs first.

### Workers

A process with the `worker` role runs the jobs. It needs FFmpeg and ffprobe, and a working directory (`PROCESSING_TEMP_PATH`) with room for the outputs. `WORKER_CONCURRENCY` sets how many jobs it runs at once.

### Multivariant playlist

The API writes `master.m3u8` itself after FFmpeg has finished. It measures the segments of each quality and lists the peak and average bitrate, the real picture size and the codec strings. FFmpeg's own playlist is not used, because FFmpeg leaves a quality out when it does not know the stream's bitrate, which is normal when a Matroska file is copied.

### Subtitles

Text subtitles inside the source (SubRip, ASS, WebVTT, MOV text) are converted to WebVTT and listed in the multivariant playlist, so every HLS player offers them. Each track gets a language, a label and a row in `subtitle_tracks`. Picture-based subtitles (DVD, Blu-ray) cannot be converted to text and are skipped, which the job output reports. A forced track is on by default, other tracks are off until the viewer turns them on.

**Subtitle files can be added to a video afterwards,** in the panel or by putting them beside a video in a [watched location](watched-locations.md).

- **Formats:** SubRip (`.srt`), WebVTT (`.vtt`) and SubStation (`.ass`, `.ssa`), up to 5 MB. Whatever comes in is read into its subtitles and written out anew as WebVTT, in the order of their start: italics, bold and underline stay; fonts, colours, positions and styles go.
- **Encodings:** Unicode is recognized. A file that is not Unicode is read in the encoding usual for its language (Windows-1256 for Arabic, Windows-1251 for Russian, and so on, Windows-1252 otherwise), and the uploader can name another.
- **The name of a file says what it is:** `film.de.srt` is German, `film.en.forced.srt` the forced English track, `film.eng.sdh.srt` English for the hard of hearing. Only the words between the last dots are read. In the panel this fills in the form; in a watched location it decides.
- **The video is not processed again.** The WebVTT file is written into the HLS output and the subtitle lines of the multivariant playlist are written anew from the rows in `subtitle_tracks`, which are the truth. A file added before the video is ready waits for processing, which includes it.
- **Added tracks outlive processing.** Their converted file is also kept under `subtitles/{assetId}/`, outside the output that processing replaces, and is put back into every new output.
- A track can be renamed, given another language, made forced, read line by line, downloaded and removed. A track that came from the video file comes back when the video is processed again.

### Seek-bar previews

The thumbnail job writes a poster and one sprite sheet: up to 100 small pictures in a single JPEG, at least two seconds apart, with a WebVTT file that tells the player which part of the sheet belongs to which time span. The playback response gives its address as `thumbnailTrackUrl`.

### Encoding profiles

A profile holds the qualities, the segment length and the keyframe interval. Profiles are created, changed and deleted through the API. The keyframe interval must divide the segment length, quality names must be unique, and widths and heights must be even. The default profile and a profile that assets use cannot be deleted. Changing a profile affects only later processing runs.

### Encryption (AES-128)

An asset created with `"encryption": "AES_128"` gets encrypted segments. Reprocessing can switch it on or off.

- Each processing run makes a new random 16-byte key and initialization vector. One key covers all qualities of the asset.
- Encrypted assets use MPEG-TS segments (`.ts`), because FFmpeg cannot encrypt fragmented MP4 with AES-128. Other assets keep fragmented MP4.
- The key is stored in `encryption_keys`, encrypted with `MASTER_KEY`. It is never written to storage. During a job it exists as a file in the working directory, outside the output folder, and is removed before the upload.
- Playlists point to the key with the relative address `../key`, so the player asks for `/v1/media/{assetId}/{token}/hls/key` with the same signed token as the segments. The answer is the 16 key bytes with `Cache-Control: no-store`.
- Subtitles, the poster and the seek-bar previews are not encrypted.

AES-128 stops people from using downloaded segments or files copied from storage. It is not DRM: a viewer who is allowed to play can also get the key. Losing or changing `MASTER_KEY` makes encrypted assets unplayable until they are reprocessed.

### Deleting and repairs

Deleting an asset marks it deleted at once, cancels its jobs and queues a `CLEANUP` job that removes its source file, streams and content key and frees the space in the pool. Deleting cannot be undone.

The scheduler role repairs what a request could not finish, once a minute: uploads that were stored but never queued for processing, and deleted assets whose files are still in storage.

### Not built yet

- Several audio languages as separate HLS audio tracks.
- Hardware encoding.

## Storage

### Pools and drivers

A storage pool is one place files are kept. Each asset belongs to one pool, and the database stores file paths relative to the pool.

| Driver  | Stores files in                       | Settings                                                                                        |
| ------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `LOCAL` | A directory on the server             | `basePath` (absolute)                                                                           |
| `S3`    | An S3 bucket or S3-compatible service | `bucket`, `region`, `endpoint`, `forcePathStyle`, `keyPrefix`, `accessKeyId`, `secretAccessKey` |

All code reads and writes files through the `StorageDriver` interface and never through the file system or an S3 client directly. Both drivers pass the same contract tests.

### Rules

- A fresh installation gets a default local pool at `STORAGE_LOCAL_PATH`.
- Exactly one pool is the default, and new assets go there. The default pool cannot be deactivated.
- The location of a pool (base path, bucket or key prefix) cannot change once the pool holds assets. Credentials and endpoint can.
- Storage keys are validated centrally. A key with `..`, an absolute path or a backslash is rejected before any driver sees it.
- The S3 secret key is encrypted with the master key and is never returned by the API or written to the audit log.
- Byte counts (`quotaBytes`, `usedBytes`) are returned as strings, because they can exceed the exact range of a JSON number.

### Not built yet

- Moving assets between pools.

## Uploads

### Flow

1. The client creates the asset with `POST /v1/assets`. The answer contains the upload endpoint and the asset id.
2. The client starts a tus upload with `POST /v1/uploads`. The `Upload-Metadata` header carries `assetId` and `filename`, and `Upload-Length` carries the file size.
3. The client sends the bytes with `PATCH /v1/uploads/{assetId}`, in as many requests as it likes.
4. After a lost connection, `HEAD /v1/uploads/{assetId}` tells the client where to continue.
5. When the last byte has arrived, the server moves the file into the storage pool as `sources/{assetId}/{file name}`, records its SHA-256 checksum and size, adds the size to the pool's used bytes and sets the asset to `UPLOADED`.

Any tus client library works, for example `tus-js-client` or Uppy in the browser.

### Rules

- An asset has one source file. A second upload for the same asset is refused.
- The file size must be known when the upload starts and must not exceed `UPLOAD_MAX_BYTES` (50 GiB by default).
- A file that would exceed the quota of the storage pool is refused before any byte is sent.
- The stored file name is reduced to letters, digits, dot, dash and underscore. The original name is kept on the asset for display.
- Uploading needs the `assets:write` permission, with a session or an API key.
- Deleting an asset during its upload removes the bytes received so far.
- Unfinished uploads are removed after 48 hours, at the next start of the API.

### Browser access

A browser on another origin than the API needs that origin listed in `CORS_ORIGINS`. The API then answers preflight requests and exposes the tus headers.

### Not built yet

- Checking the file type before processing. Any file is accepted and the probe step decides whether it is usable.
- Removing the files of deleted assets and reducing the pool's used bytes. This arrives with the cleanup job.
- Uploading directly from the browser to S3.

## Storage layout

All paths are relative to the storage pool root.

```
sources/{assetId}/{file name}
assets/{assetId}/hls/master.m3u8
assets/{assetId}/hls/{quality}/playlist.m3u8
assets/{assetId}/hls/{quality}/init.mp4          (init_0.mp4, init_1.mp4 ... with several qualities)
assets/{assetId}/hls/{quality}/seg-00000.m4s
assets/{assetId}/hls/{quality}/seg-00000.ts           (encrypted assets, which have no init file)
assets/{assetId}/hls/subs/{number}-{language}/playlist.m3u8
assets/{assetId}/hls/subs/{number}-{language}/subtitles.vtt
assets/{assetId}/hls/subs/u-{trackId}/subtitles.vtt     (a subtitle file added afterwards)
subtitles/{assetId}/{trackId}.vtt                      (its copy that outlives processing)
assets/{assetId}/thumbs/poster.jpg
assets/{assetId}/thumbs/sprite.jpg
assets/{assetId}/thumbs/sprite.vtt
```

Audio is stored inside each quality's segments. Separate audio tracks get their own folders when they are built.

## Playback and URL signing

### Flow

1. A client with the `assets:read` permission calls `POST /v1/assets/{id}/playback`.
2. The API answers with a manifest URL, a poster URL and the time they expire.
3. The player loads the manifest and follows it to the playlists and segments. None of these requests needs a session or an API key.

A playback URL looks like this:

```
/v1/media/{assetId}/{expiry}.{signature}/hls/master.m3u8
```

The part between the asset id and the file path is the token: the expiry as Unix time in seconds, and an HMAC-SHA256 signature over the asset id and the expiry.

### Rules

- A token opens the generated files of its asset: everything under `hls/` and `thumbs/`. It never opens the source file, another asset, or a path with `..` in it.
- A token is valid for `PLAYBACK_URL_TTL_SECONDS` (six hours by default), or longer for videos that need more time.
- Every refusal is a plain 404, whether the token is wrong, expired or for another asset, so a request learns nothing about which assets exist.
- Only assets with status `READY` can be played.
- Media responses allow any web origin, because players are embedded on other sites and the signed URL is the authorization. All other endpoints stay limited to `CORS_ORIGINS`.
- Byte ranges are supported, with `206` and `416` answers.

### Media origin

Playback URLs are relative paths while the API serves the files. When `MEDIA_BASE_URL` is set, the URLs start with that origin, so the files can be served from another host that verifies the same tokens.

### Not built yet

- Verification of the token by an edge server. The Nginx gateway of the Compose setup already does it, see [the Compose README](../deploy/compose/README.md).
- Redirecting to pre-signed URLs for pools in S3.
- Limits per viewer, such as concurrent streams. They belong to the viewer accounts of phase 2.

## API endpoints

All endpoints are under `/v1`. Every endpoint needs credentials unless marked public. Credentials are sent as `Authorization: Bearer <token>`, where the token is a session token or an API key.

Status shows what exists today.

| Method                  | Path                                    | Purpose                                                                                                         | Status |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| `GET`                   | `/health`                               | Readiness with dependency status (public)                                                                       | Built  |
| `GET`                   | `/health/live`                          | Liveness (public)                                                                                               | Built  |
| `GET`                   | `/auth/setup`                           | Whether first-run setup is still required (public)                                                              | Built  |
| `POST`                  | `/auth/setup`                           | Create the first owner. Works only while no admin exists (public)                                               | Built  |
| `POST`                  | `/auth/login`                           | Start an admin session (public)                                                                                 | Built  |
| `POST`                  | `/auth/logout`                          | End the session                                                                                                 | Built  |
| `GET`                   | `/auth/me`                              | The authenticated caller and its permissions                                                                    | Built  |
| `POST`                  | `/auth/password`                        | Change your own password                                                                                        | Built  |
| `GET`                   | `/auth/two-factor`                      | Where you stand with two-factor sign-in. See [operations](phase-6-operations.md#two-factor-sign-in-for-admins)  | Built  |
| `POST`                  | `/auth/two-factor/setup`, `/enable`     | Set it up: your password for the secret, then the first code from the app for the recovery codes                | Built  |
| `POST`                  | `/auth/two-factor/disable`              | Switch it off, with your password and a code                                                                    | Built  |
| `POST`                  | `/auth/two-factor/recovery-codes`       | Make new recovery codes, with your password and a code                                                          | Built  |
| `DELETE`                | `/admins/{id}/two-factor`               | Take two-factor sign-in off another admin who is locked out                                                     | Built  |
| `GET` `POST`            | `/admins`                               | List and create admins                                                                                          | Built  |
| `GET` `PATCH` `DELETE`  | `/admins/{id}`                          | Read, update and deactivate an admin                                                                            | Built  |
| `POST`                  | `/titles/{id}/duplicate`                | A copy of a title as a draft, with a choice of what comes along                                                 | Built  |
| `GET` `PUT` `DELETE`    | `/branding`                             | The name, logo, icon, colour and footer of the site. See [operations](phase-6-operations.md#branding)           | Built  |
| `GET` `POST`            | `/webhooks`                             | Addresses that are told when something happens. See [operations](phase-6-operations.md#webhooks)                | Built  |
| `GET`                   | `/openapi.json`                         | Public. The API described as OpenAPI 3.1. See [the API, described](api.md)                                      | Built  |
| `GET`                   | `/meta`                                 | Public. What an app asks first: the site, the server version, whether the app is supported                      | Built  |
| `GET` `PUT`             | `/app-versions`                         | The oldest version of each app that may connect                                                                 | Built  |
| `GET`                   | `/titles/{id}/history`                  | What changed on a title, who changed it and when. See [the catalog](phase-2-catalog.md#the-history-of-a-title)  | Built  |
| `POST`                  | `/titles/{id}/history/{rev}/restore`    | Bring an earlier version of a title back                                                                        | Built  |
| `GET`                   | `/translations/terms`                   | Categories, genres, collections and people: what there is to translate and how far each language is             | Built  |
| `GET`                   | `/translations/terms/{kind}`            | The terms of a kind with their translation into `?language=`, searchable, or only what is `missing`             | Built  |
| `PUT` `DELETE`          | `/translations/terms/{kind}/{language}` | Save the translations of up to 200 terms at once; take a language away from a kind                              | Built  |
| `GET` `POST`            | `/roles`                                | The roles, built in and custom, with every permission explained; make a custom role                             | Built  |
| `GET` `PATCH` `DELETE`  | `/roles/{id}`                           | Read a custom role with its holders, change it, delete it (`?moveTo=` says where its holders go)                | Built  |
| `GET` `POST`            | `/api-keys`                             | List and create API keys                                                                                        | Built  |
| `DELETE`                | `/api-keys/{id}`                        | Revoke an API key                                                                                               | Built  |
| `GET`                   | `/audit-logs`                           | List audit entries with filters                                                                                 | Built  |
| `GET` `POST`            | `/storage-pools`                        | List and create storage pools                                                                                   | Built  |
| `GET` `PATCH`           | `/storage-pools/{id}`                   | Read and update a storage pool                                                                                  | Built  |
| `POST`                  | `/storage-pools/{id}/test`              | Write, read and delete a test file to confirm the pool works                                                    | Built  |
| `GET`                   | `/encoding-profiles`                    | List encoding profiles                                                                                          | Built  |
| `GET`                   | `/encoding-profiles/{id}`               | Read an encoding profile                                                                                        | Built  |
| `POST`                  | `/encoding-profiles`                    | Create an encoding profile                                                                                      | Built  |
| `PATCH` `DELETE`        | `/encoding-profiles/{id}`               | Update and delete a profile                                                                                     | Built  |
| `POST`                  | `/assets`                               | Create an asset and get an upload URL                                                                           | Built  |
| `GET`                   | `/assets`                               | List assets with filters, ordering (`sort`, `order`) and pagination. Ready assets carry a signed `posterUrl`    | Built  |
| `GET` `PATCH` `DELETE`  | `/assets/{id}`                          | Read, update and soft-delete an asset                                                                           | Built  |
| `POST`                  | `/uploads`                              | Start a resumable upload for an asset (tus)                                                                     | Built  |
| `HEAD` `PATCH` `DELETE` | `/uploads/{assetId}`                    | Check progress, send bytes, cancel (tus)                                                                        | Built  |
| `POST`                  | `/assets/{id}/reprocess`                | Process again, optionally with another mode or profile                                                          | Built  |
| `POST`                  | `/assets/{id}/playback`                 | Get a signed manifest URL                                                                                       | Built  |
| `GET` `HEAD`            | `/media/{assetId}/{token}/{file}`       | Generated files of an asset. The signed token is the authorization (public)                                     | Built  |
| `GET`                   | `/jobs`                                 | List jobs with filters                                                                                          | Built  |
| `GET`                   | `/jobs/{id}`                            | Read a job                                                                                                      | Built  |
| `POST`                  | `/jobs/{id}/cancel`                     | Cancel a job                                                                                                    | Built  |
| `POST`                  | `/jobs/{id}/retry`                      | Retry a failed job                                                                                              | Built  |
| `GET`                   | `/media/{assetId}/{token}/hls/key`      | AES-128 content key of an encrypted asset (signed token in the path)                                            | Built  |
| `GET`                   | `/stats/overview`                       | Figures for the dashboard: assets, jobs, storage, uploads per day, recent failures                              | Built  |
| `GET`                   | `/assets/{id}/media`                    | Qualities, subtitle tracks and pictures of an asset, with signed addresses                                      | Built  |
| `POST`                  | `/assets/{id}/subtitles`                | Add a subtitle file. The body is the file; `language`, `label`, `forced`, `filename`, `encoding` in the address | Built  |
| `PATCH`, `DELETE`       | `/assets/{id}/subtitles/{trackId}`      | Rename a track, change its language or make it forced; remove it                                                | Built  |
| `GET`                   | `/assets/{id}/subtitles/{trackId}/file` | The WebVTT file of a track                                                                                      | Built  |
| `GET`                   | `/events`                               | Stream of live events for the admin panel (server-sent events)                                                  | Built  |

## Authentication and access control

### Credentials

| Credential    | Format                                      | Lifetime                             | Stored as    |
| ------------- | ------------------------------------------- | ------------------------------------ | ------------ |
| Session token | `onyx_sess_` + random value                 | 7 days, or until logout              | SHA-256 hash |
| API key       | `onyx_key_` + 8-character id + random value | Until revoked or its optional expiry | SHA-256 hash |

A token or key is shown once, when it is created. It cannot be read back later.

### Protection against guessing

- Passwords need at least 12 characters and are hashed with scrypt.
- After 5 failed sign-ins for the same email and IP address within 15 minutes, further attempts get a 429 response until the window ends. The counters live in Redis.
- A wrong password and an unknown email get the same response and take the same time.

### Permissions

Endpoints declare the permissions they need. Each of the four built-in roles grants a fixed set:

| Permission area                       | OWNER          | ADMIN          | EDITOR         | VIEWER |
| ------------------------------------- | -------------- | -------------- | -------------- | ------ |
| Admins, API keys, audit log, settings | Read and write | Read and write | None           | None   |
| Storage pools                         | Read and write | Read and write | Read           | Read   |
| Assets, jobs, encoding profiles       | Read and write | Read and write | Read and write | Read   |

Further rules:

- Only an owner can create, change or deactivate an owner.
- Nobody can change their own role or deactivate themselves.
- The last active owner cannot be demoted or deactivated.
- Admins are deactivated, never deleted, so the audit log keeps its references.
- Deactivation, a role change and a password reset sign the admin out everywhere.

### Custom roles

Between "everything" and "content only" there is room for a support team, a finance person or a live operator. A custom role is a name, a colour and a list of permissions, made on the **Roles** page of the panel.

- **Each area of the panel has up to three levels:** no access, can see, can change. Changing an area includes seeing it. The page explains every level in a sentence, and marks the areas that reach further than their own page: billing, settings, admins and API keys.
- **The built-in roles stay as they are.** They can be duplicated as a starting point. **Compare** shows every role next to every other.
- **A change to a role counts from the next request** of everyone who holds it. Nobody has to sign in again.
- **Nobody hands out more than they hold.** An admin can only build a role from their own permissions, only give a role that may do no more than theirs, and only change, reset or deactivate an admin who may do no more than they do. Without this, a role that may only manage admins would be a way to every other permission.
- **Nobody changes the role they hold themselves,** and nobody changes a role that may do more than their own.
- **Owner stays special:** only an owner makes or changes an owner, whatever a custom role holds.
- **A role in use is not deleted by accident.** Deleting it asks which role its holders get instead; they are signed out, as after any change of role.
- **API keys follow:** a key loses a permission the moment the role of its creator does.
- Roles are managed by a signed-in admin with the permission to change admins, never by an API key. Every change is written to the audit log with what was added and what was taken away.

For the API: an admin has `role` (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER` or `CUSTOM`) and, for `CUSTOM`, `customRoleId`.

### API keys

- A key carries scopes, which are permissions chosen when it is created.
- A key can only hold permissions its creator holds. If the creator is moved to a lower role or deactivated, the key loses access accordingly.
- Managing admins and managing API keys always needs a signed-in admin. Those two permissions cannot be given to a key.

### Audit log

These events are recorded with actor, target, time and IP address: setup, sign-in, failed sign-in, sign-out, password change, admin created, updated or deactivated, API key created or revoked. Passwords, tokens and keys are never written to the log.

### Not built yet

- Cookie-based sessions for the admin panel. Bearer tokens are used for now.
- A setting for trusted proxies. Until it exists, the recorded IP address is that of the nearest proxy when the API runs behind one.

## Open questions

- Whether large uploads go directly from the browser to S3 with multipart upload, or always through the API.
