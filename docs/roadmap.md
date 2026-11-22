# Roadmap

The project is built in phases. Each phase ends with something that works end to end.

| Phase                         | Delivers                                                                            | Status              |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| 1. Media engine core          | Upload, probe, copy or transcode, HLS packaging, signed playback, basic admin panel | Done                |
| 2. Catalog and viewer website | Titles, series, metadata import, viewer accounts and profiles, player with resume   | Done                |
| 3. Billing                    | Plans, payments, entitlements, coupons. First complete VOD service                  | Done, coupons later |
| 4. Live                       | Ingest, copy and transcode channels, DVR, EPG, channels in the catalog              | Done                |
| 5. Edges and P2P              | Edge agent, tracker, P2P in the player, offload statistics                          | Done                |
| 6. Operations                 | Installer, updates with rollback, backup and restore, diagnostics                   | In progress         |
| 7. Apps                       | Android mobile and Android TV                                                       | Planned             |
| 8. Advanced                   | DRM, ads, analytics dashboards, further apps                                        | Planned             |

## Phase 1 in steps

1. Repository foundation: workspace, database schema, development infrastructure. **Done.**
2. API skeleton: configuration, roles, health check, database and queue connections. **Done.**
3. Admin authentication: login, sessions, roles, API keys, audit log. **Done.**
4. Storage: local and S3-compatible drivers behind one interface. **Done.**
5. Upload: resumable upload, source file registration. **Done.**
6. Processing pipeline: probe, decision engine, remux, transcode, package, poster. **Done.** Step 6b added seek-bar previews, embedded subtitles as WebVTT tracks and management of encoding profiles. **Done.** AES-128 encryption with key delivery over the signed playback path is built as well. **Done.**
7. Playback: signed URLs and delivery of the generated files by the API. **Done.** Step 9 added verification of the same tokens by Nginx.
8. Admin panel: login, asset library, upload, job monitor, player preview. **Done.** Step 8b added pages for encoding profiles, storage pools, admins, API keys, the audit log and the admin's own account. **Done.**
9. Docker images and a single-server Compose file, with an Nginx gateway that serves the admin panel and checks playback tokens itself. **Done.**
10. Admin panel design system: Tailwind and Radix components, light and dark themes, command palette, dashboard, library with posters, sorting, bulk actions and drag-and-drop upload. **Done.** Step 10b added live updates pushed from the server and the video workspace with qualities, subtitles, pictures and activity. **Done.**

See [phase-1-media-engine.md](phase-1-media-engine.md) for the design.

## Phase 4 in steps

1. Channels pulled from an address: sources over HTTP, RTMP, SRT, UDP and RTP, a live process that keeps them running, repackaging to HLS without re-encoding, signed delivery, and the Channels page with a live preview. **Done.**
2. Transcoding to several qualities that players switch between, for any source the server can read. **Done.**
3. Channels pushed by an encoder over RTMP or SRT, with a stream key per channel and an ingest server. **Done.**
4. Going back in time: a window of up to four hours per channel, with pause, rewind and starting the running programme over. **Done.** Recording a programme or a time range into the library, where it becomes a video like any upload. **Done.**
5. A programme guide: import from XMLTV sources, programmes by hand, now and next in the lineup and a timetable for viewers. **Done.**
6. Channels in the catalog, in packages and on the viewer website. **Done.** Built before steps 4 and 5, so that viewers can watch channels at all.

See [phase-4-live.md](phase-4-live.md) for the design.

## Phase 5 in steps

1. Edge servers: the edge agent, adding edges in the panel, sending viewers to them by content and weight, a key per edge, and the Edge servers page with live figures. **Done.**
2. Edges in daily use: players that move to another server by themselves when theirs goes away, emptying the copies of an edge from the panel, and the history of what each edge delivered. **Done.** Routing by country and filling an edge ahead of a premiere are left for later: the first needs a source for the country of a viewer.
3. The tracker: the service viewers find each other through, tokens for it from the main server, and the P2P page in the panel. **Done.**
4. P2P in the player: viewers of the same video or channel exchange segments, with HTTP as the fallback. **Done.**
5. Offload statistics: how much edges and viewers took off the main server. **Done.**

See [phase-5-edges.md](phase-5-edges.md) for the design.

## Phase 6 in steps

1. Backup and restore: scheduled, encrypted backups of the database in a storage pool, each proven to open, the Backups page in the panel, and a command line tool that restores one. **Done.**
2. The installer: one command that sets up a server.
3. Updates with rollback.
4. Diagnostics: one page that says what is wrong with an installation.

See [phase-6-operations.md](phase-6-operations.md) for the design.
