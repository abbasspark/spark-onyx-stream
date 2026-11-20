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

Each step is a job. A step queues the next one when it succeeds.

| Step | Job type     | What it does                                                            |
| ---- | ------------ | ----------------------------------------------------------------------- |
| 1    | `PROBE`      | Runs ffprobe, stores the raw result and the summary fields on the asset |
| 2    | (decision)   | Chooses the processing mode. Runs inside the probe job                  |
| 3a   | `REMUX`      | Copy mode: repackages the source streams without re-encoding            |
| 3b   | `TRANSCODE`  | Transcode mode: encodes each rendition of the encoding profile          |
| 4    | `PACKAGE`    | Writes HLS playlists and fMP4 segments, encrypts if enabled             |
| 5    | `THUMBNAILS` | Poster image, sprite sheet and its WebVTT index                         |
| 6    | `SUBTITLES`  | Extracts embedded subtitles and converts them to WebVTT                 |

Steps 5 and 6 run in parallel with step 3. The asset becomes `READY` when step 4 finishes. Missing thumbnails or subtitles do not block playback.

### Decision engine

The mode can be forced at upload time. Otherwise:

| Condition                                                                                         | Mode        |
| ------------------------------------------------------------------------------------------------- | ----------- |
| Video is H.264, audio is AAC, and the keyframe interval is regular and at most the segment length | `COPY`      |
| Anything else                                                                                     | `TRANSCODE` |

`PASSTHROUGH` is never chosen automatically. It is available as a forced mode for files that should be served unchanged.

Copy mode produces a single rendition, so there is no adaptive bitrate. The panel shows this and offers "transcode anyway".

### Transcoding rules

- Renditions taller than the source are skipped. Nothing is upscaled.
- Every rendition uses the keyframe interval and segment length of the encoding profile, with scene-change keyframes disabled, so segments line up across renditions.
- The default profile has 1080p, 720p, 480p and 360p renditions in H.264 with AAC audio.
- CPU encoding (libx264) in phase 1. Hardware encoders are added behind the same interface later.

### Job handling

- BullMQ drives execution. The `jobs` table mirrors each job for history and for the panel.
- Failed jobs retry with exponential backoff up to `maxAttempts`.
- A worker reports progress parsed from FFmpeg output.
- A job can be cancelled. The worker stops the FFmpeg process and removes partial output.
- When a worker dies, BullMQ marks its job as stalled and another worker picks it up.

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
sources/{assetId}/{original filename}
assets/{assetId}/master.m3u8
assets/{assetId}/v/{rendition}/playlist.m3u8
assets/{assetId}/v/{rendition}/init.mp4
assets/{assetId}/v/{rendition}/seg-00001.m4s
assets/{assetId}/a/{language}/playlist.m3u8
assets/{assetId}/subs/{language}.vtt
assets/{assetId}/thumbs/poster.jpg
assets/{assetId}/thumbs/sprite.jpg
assets/{assetId}/thumbs/sprite.vtt
```

## Playback and URL signing

1. A client calls `POST /v1/assets/{id}/playback`.
2. The API returns a manifest URL containing an expiry time and an HMAC signature over the asset path and the expiry.
3. Nginx verifies the signature for every request under that asset path. The API is not involved in segment delivery.
4. For AES-128, the playlist points to `GET /v1/keys/{assetId}`. That endpoint checks the same signature and returns the content key.

The signature covers the asset directory and not a single file, so one signature authorizes the manifest and all its segments until it expires.

## API endpoints

All endpoints are under `/v1`. Every endpoint needs credentials unless marked public. Credentials are sent as `Authorization: Bearer <token>`, where the token is a session token or an API key.

Status shows what exists today.

| Method                  | Path                       | Purpose                                                           | Status  |
| ----------------------- | -------------------------- | ----------------------------------------------------------------- | ------- |
| `GET`                   | `/health`                  | Readiness with dependency status (public)                         | Built   |
| `GET`                   | `/health/live`             | Liveness (public)                                                 | Built   |
| `GET`                   | `/auth/setup`              | Whether first-run setup is still required (public)                | Built   |
| `POST`                  | `/auth/setup`              | Create the first owner. Works only while no admin exists (public) | Built   |
| `POST`                  | `/auth/login`              | Start an admin session (public)                                   | Built   |
| `POST`                  | `/auth/logout`             | End the session                                                   | Built   |
| `GET`                   | `/auth/me`                 | The authenticated caller and its permissions                      | Built   |
| `POST`                  | `/auth/password`           | Change your own password                                          | Built   |
| `GET` `POST`            | `/admins`                  | List and create admins                                            | Built   |
| `GET` `PATCH` `DELETE`  | `/admins/{id}`             | Read, update and deactivate an admin                              | Built   |
| `GET` `POST`            | `/api-keys`                | List and create API keys                                          | Built   |
| `DELETE`                | `/api-keys/{id}`           | Revoke an API key                                                 | Built   |
| `GET`                   | `/audit-logs`              | List audit entries with filters                                   | Built   |
| `GET` `POST`            | `/storage-pools`           | List and create storage pools                                     | Built   |
| `GET` `PATCH`           | `/storage-pools/{id}`      | Read and update a storage pool                                    | Built   |
| `POST`                  | `/storage-pools/{id}/test` | Write, read and delete a test file to confirm the pool works      | Built   |
| `GET` `POST`            | `/encoding-profiles`       | List and create encoding profiles                                 | Planned |
| `PATCH` `DELETE`        | `/encoding-profiles/{id}`  | Update and delete a profile                                       | Planned |
| `POST`                  | `/assets`                  | Create an asset and get an upload URL                             | Built   |
| `GET`                   | `/assets`                  | List assets with filters and pagination                           | Built   |
| `GET` `PATCH` `DELETE`  | `/assets/{id}`             | Read, update and soft-delete an asset                             | Built   |
| `POST`                  | `/uploads`                 | Start a resumable upload for an asset (tus)                       | Built   |
| `HEAD` `PATCH` `DELETE` | `/uploads/{assetId}`       | Check progress, send bytes, cancel (tus)                          | Built   |
| `POST`                  | `/assets/{id}/reprocess`   | Process again, optionally with another mode or profile            | Planned |
| `POST`                  | `/assets/{id}/playback`    | Get a signed manifest URL                                         | Planned |
| `GET`                   | `/jobs`                    | List jobs with filters                                            | Planned |
| `GET`                   | `/jobs/{id}`               | Read a job                                                        | Planned |
| `POST`                  | `/jobs/{id}/cancel`        | Cancel a job                                                      | Planned |
| `POST`                  | `/jobs/{id}/retry`         | Retry a failed job                                                | Planned |
| `GET`                   | `/keys/{assetId}`          | AES-128 content key (signature required)                          | Planned |

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

Endpoints declare the permissions they need. A role grants a fixed set:

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

### API keys

- A key carries scopes, which are permissions chosen when it is created.
- A key can only hold permissions its creator holds. If the creator is moved to a lower role or deactivated, the key loses access accordingly.
- Managing admins and managing API keys always needs a signed-in admin. Those two permissions cannot be given to a key.

### Audit log

These events are recorded with actor, target, time and IP address: setup, sign-in, failed sign-in, sign-out, password change, admin created, updated or deactivated, API key created or revoked. Passwords, tokens and keys are never written to the log.

### Not built yet

- Two-factor authentication. The schema has the field for it.
- Cookie-based sessions for the admin panel. Bearer tokens are used for now.
- A setting for trusted proxies. Until it exists, the recorded IP address is that of the nearest proxy when the API runs behind one.

## Open questions

- Whether large uploads go directly from the browser to S3 with multipart upload, or always through the API.
- Whether packaging is done by FFmpeg alone or by a dedicated packager. FFmpeg alone is the starting point.
- The exact Nginx mechanism for signature checks: the built-in secure link module or a small script module.
