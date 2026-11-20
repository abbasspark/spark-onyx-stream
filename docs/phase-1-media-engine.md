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

All endpoints are under `/v1` and need an admin session or an API key, except where noted.

| Method                 | Path                      | Purpose                                                |
| ---------------------- | ------------------------- | ------------------------------------------------------ |
| `POST`                 | `/auth/login`             | Start an admin session (public)                        |
| `POST`                 | `/auth/logout`            | End the session                                        |
| `GET`                  | `/auth/me`                | Current admin                                          |
| `GET` `POST`           | `/admins`                 | List and create admins                                 |
| `PATCH` `DELETE`       | `/admins/{id}`            | Update and deactivate an admin                         |
| `GET` `POST`           | `/api-keys`               | List and create API keys                               |
| `DELETE`               | `/api-keys/{id}`          | Revoke an API key                                      |
| `GET` `POST`           | `/storage-pools`          | List and create storage pools                          |
| `PATCH`                | `/storage-pools/{id}`     | Update a storage pool                                  |
| `GET` `POST`           | `/encoding-profiles`      | List and create encoding profiles                      |
| `PATCH` `DELETE`       | `/encoding-profiles/{id}` | Update and delete a profile                            |
| `POST`                 | `/assets`                 | Create an asset and get an upload URL                  |
| `GET`                  | `/assets`                 | List assets with filters and pagination                |
| `GET` `PATCH` `DELETE` | `/assets/{id}`            | Read, update and soft-delete an asset                  |
| `POST`                 | `/assets/{id}/reprocess`  | Process again, optionally with another mode or profile |
| `POST`                 | `/assets/{id}/playback`   | Get a signed manifest URL                              |
| `GET`                  | `/jobs`                   | List jobs with filters                                 |
| `GET`                  | `/jobs/{id}`              | Read a job                                             |
| `POST`                 | `/jobs/{id}/cancel`       | Cancel a job                                           |
| `POST`                 | `/jobs/{id}/retry`        | Retry a failed job                                     |
| `GET`                  | `/keys/{assetId}`         | AES-128 content key (signature required)               |
| `GET`                  | `/health`                 | Liveness and dependency status (public)                |

Uploads use the tus resumable upload protocol on `/v1/uploads`.

## Roles

| Role     | Can do                                             |
| -------- | -------------------------------------------------- |
| `OWNER`  | Everything, including managing admins and settings |
| `ADMIN`  | Everything except managing owners                  |
| `EDITOR` | Manage assets, profiles and jobs                   |
| `VIEWER` | Read only                                          |

## Open questions

- Which S3 client library to use, and whether multipart upload goes directly from the browser to S3.
- Whether packaging is done by FFmpeg alone or by a dedicated packager. FFmpeg alone is the starting point.
- The exact Nginx mechanism for signature checks: the built-in secure link module or a small script module.
