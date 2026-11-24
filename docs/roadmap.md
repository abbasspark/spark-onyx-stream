# Roadmap

The project is built in phases. Each phase ends with something that works end to end.

| Phase                         | Delivers                                                                            | Status              |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| 1. Media engine core          | Upload, probe, copy or transcode, HLS packaging, signed playback, basic admin panel | Done                |
| 2. Catalog and viewer website | Titles, series, metadata import, viewer accounts and profiles, player with resume   | Done                |
| 3. Billing                    | Plans, payments, entitlements, coupons. First complete VOD service                  | Done, coupons later |
| 4. Live                       | Ingest, copy and transcode channels, DVR, EPG, channels in the catalog              | Done                |
| 5. Edges and P2P              | Edge agent, tracker, P2P in the player, offload statistics                          | Done                |
| 6. Operations                 | Installer, updates with rollback, backup and restore, diagnostics                   | Done                |
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
2. The installer: one command that sets up a server, with HTTPS for a domain, and the `onyx` command for the days after. **Done.**
3. Updates with rollback: `onyx update` builds the new version beside the running one, copies the database at the last moment, switches, and goes back by itself when the new version does not answer. `onyx rollback` undoes an update later. **Done.**
4. Diagnostics: one page that says what is wrong with an installation and what to do about it, a mark in the header of the panel, emails to the owners when a problem appears, and whether a newer version exists. **Done.**

See [phase-6-operations.md](phase-6-operations.md) for the design.

## The catalog grows

Before the apps, the panel becomes a fuller catalog system. This work is outside the numbered phases.

1. Movies and series as sections of their own, facts, genres, cast and crew, season posters and air dates, all filled by the import. **Done.**
2. Pages for all people and all genres, collections, extras (several trailers and clips per title), and dates between which a title is shown. **Done.**
3. Texts of titles, seasons and episodes in more languages, filled by hand or from TMDB, and served by the public catalog. **Done.**
4. Genres, facts, people, extras, collections and a choice of language on the viewer website. **Done.**
5. Watched folders and buckets that import files named by their TMDB id by themselves, with a page for what became of each file. **Done.** See [watched-locations.md](watched-locations.md).
6. Actions on many movies or series at once, on a selection or on everything the filters match, including translating them into a language in the background. **Done.**
7. Subtitle files for a video: added in the panel or found beside a video in a watched location, converted to WebVTT and offered by the player without processing the video again. **Done.**
8. A home page arranged in the panel: an opening with titles that take turns, rows from categories, genres, collections or hand-picked titles, three looks for a row, and dates for rows of a season. **Done.**
9. Viewing statistics: what is watched, how long, by how many and on what, per day and per title, recorded without addresses. **Done.** See [viewing-statistics.md](viewing-statistics.md).
10. The pages for movies and for series arranged like the home page, in a group of their own in the panel. **Done.**
11. The live page and the pages of categories and genres arranged with the same builder. **Done.**
12. My list: viewers save titles to watch later, per profile, with a page and a row of their own, and the panel sees what is saved the most. **Done.**
13. Coupons: codes made in the panel that lower the price of a plan or of renting and buying a title, with limits and a record of every use. **Done.**
14. Stream limits: an account plays on so many devices at once, set for the installation, per plan or per viewer, with a way to stop another device. **Done.**
15. Two-factor sign-in for admins: a code from an authenticator app after the password, recovery codes, and an installation that can ask every admin for it. **Done.**
16. Custom roles: roles made in the panel from the permission list, area by area, with rules that keep anyone from handing out more than they hold. **Done.**
17. Translations of categories, genres, collections and people, worked on a language at a time in the panel, and read by viewers wherever these names show. **Done.**
18. Duplicating a title: a draft copy with a choice of what comes along, sharing videos and pictures with the original. **Done.**
19. The history of a title: who changed what and when, shown as before and after, with a way to bring an earlier version back. **Done.**
20. Site branding: the name, logo, icon, accent colour and footer of the website, set in the panel with a live sketch. **Done.**
21. Outgoing webhooks: your own systems are told when a title goes live, a viewer signs up or a payment arrives, with signed requests, retries and a record of every delivery. **Done.**

## Before the apps

A comparison with other platforms named ten things that change what the API says to an app, or how videos are packaged. They are cheap before apps are installed on devices and expensive after.

1. The API described for programs: an OpenAPI description produced from the code, types generated from it, an API reference in the panel, and a way to tell an app that it is too old. **Done.** See [api.md](api.md).
2. Devices, and sign-in on a television with a code: a device has an identity that outlasts its sign-ins, and a television shows a code that the viewer confirms on their phone. **Done.** See [phase-2-viewers.md](phase-2-viewers.md#devices-and-signing-in-with-a-code).
3. Parental controls: an age on titles and channels, profiles with a limit, profiles for children, and a PIN per profile. **Done.** See [phase-2-viewers.md](phase-2-viewers.md#parental-controls).
4. Several sound tracks per video, kept apart from the picture, a language added later without processing the picture again, and the languages a profile likes to hear and to read. **Done.** See [phase-1-media-engine.md](phase-1-media-engine.md#sound).
5. Skip recap, intro and credits: markers on a video, set in the panel against the player or found for a season by comparing the sound of its episodes. **Done.** See [phase-1-media-engine.md](phase-1-media-engine.md#markers).
6. Similar titles: found by comparing genres, keywords, people and collections and by what the same viewers watch, corrected by an editor who pins and hides, shown on the page of a title, at the end of a video and as rows made from what a profile watched. **Done.** See [phase-2-catalog.md](phase-2-catalog.md#similar-titles).
7. Reports from players about how playback went: the time to start, waiting, quality and what broke, for videos and live channels, with a page in the panel that grades them and compares devices, servers and players. **Done.** See [playback-quality.md](playback-quality.md).
8. Notifications: a list on every account, pushed to browsers with the installation's own key and to apps through the operator's Firebase project, sent by themselves for new episodes and new titles, and written by an admin for an audience, at once or at a set time. **Done.** See [notifications.md](notifications.md).
9. Prepaid codes: made in batches for a plan and a number of days, downloaded for cards and resellers, and entered by a viewer to start the plan or to add days to it, with every code kept unreadable and usable once. **Done.** See [prepaid-codes.md](prepaid-codes.md).
10. Selling inside the apps, or sending viewers to the website. **To decide.**

Content protection with DRM follows the first app release, as something an operator switches on with a licence service of their own.
