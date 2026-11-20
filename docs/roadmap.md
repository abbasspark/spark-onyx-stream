# Roadmap

The project is built in phases. Each phase ends with something that works end to end.

| Phase                         | Delivers                                                                            | Status            |
| ----------------------------- | ----------------------------------------------------------------------------------- | ----------------- |
| 1. Media engine core          | Upload, probe, copy or transcode, HLS packaging, signed playback, basic admin panel | In design         |
| 2. Catalog and viewer website | Titles, series, metadata import, viewer accounts and profiles, player with resume   | Planned           |
| 3. Billing                    | Plans, payments, entitlements, coupons. First complete VOD service                  | Planned           |
| 4. Live                       | Ingest, copy and transcode channels, DVR, EPG, channels in the catalog              | Planned           |
| 5. Edges and P2P              | Edge agent, tracker, P2P in the player, offload statistics                          | Planned           |
| 6. Operations                 | Installer, updates with rollback, backup and restore, diagnostics                   | Starts in phase 1 |
| 7. Apps                       | Android mobile and Android TV                                                       | Planned           |
| 8. Advanced                   | DRM, ads, analytics dashboards, further apps                                        | Planned           |

## Phase 1 in steps

1. Repository foundation: workspace, database schema, development infrastructure. **Done.**
2. API skeleton: configuration, roles, health check, database and queue connections. **Done.**
3. Admin authentication: login, sessions, roles, API keys, audit log. **Done.**
4. Storage: local and S3-compatible drivers behind one interface. **Done.**
5. Upload: resumable upload, source file registration. **Done.**
6. Processing pipeline: probe, decision engine, remux, transcode, package, poster. **Done.** Step 6b added seek-bar previews, embedded subtitles as WebVTT tracks and management of encoding profiles. **Done.** AES-128 encryption with key delivery over the signed playback path is built as well. **Done.**
7. Playback: signed URLs and delivery of the generated files by the API. **Done.** Verification of the same tokens by Nginx moves to step 9, where it can be tested with the Docker setup.
8. Admin panel: login, asset library, upload, job monitor, player preview.
9. Development Docker image and a first single-server Compose file.

See [phase-1-media-engine.md](phase-1-media-engine.md) for the design.
