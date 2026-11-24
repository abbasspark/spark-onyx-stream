# Settings

Everything about an installation is set with environment variables. The API
reads them when it starts and refuses to start when one is missing or cannot
be used, naming it.

In the installation that comes with the project they live in `.env` next to
`docker-compose.yml`, and `deploy/compose/.env.example` is a copy of them with
the usual values. The installer writes that file.

Five settings have no default and must be there: `DATABASE_URL`, `REDIS_URL`,
`JWT_SECRET`, `PLAYBACK_SIGNING_SECRET` and `MASTER_KEY`. `./init-env.sh` and
the installer make the three secrets. Everything else has a default that works.

This page is the whole list. Where a subject has a page of its own, it says
more than the table can: [billing](phase-3-billing.md),
[live television](phase-4-live.md), [notifications](notifications.md),
[edge servers](phase-5-edges.md) and [operations](phase-6-operations.md).

## The process

| Setting            | Default       | What it does                                                                                                                                                                                                                      |
| ------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `development` | How the installation runs: `production`, `development` or `test`. In production, error details are kept out of answers.                                                                                                           |
| `APP_ROLE`         | `all`         | What this process does: `all`, or some of `api`, `worker`, `scheduler`, `live`, separated by commas. One image, several roles.                                                                                                    |
| `API_HOST`         | `0.0.0.0`     | Address the HTTP server listens on.                                                                                                                                                                                               |
| `API_PORT`         | `3000`        | Port the HTTP server listens on.                                                                                                                                                                                                  |
| `TRUST_PROXY_HOPS` | `0`           | How many proxies stand in front of the API. The address of the viewer is read from this, and the audit log, the sign-in limit and every rate limit go by it. The gateway is one; `docker-compose.tls.yml` makes it two by itself. |
| `CORS_ORIGINS`     | empty         | Web origins allowed to call the API from a browser, separated by commas, for example https://admin.example.com. Empty allows same-origin requests only.                                                                           |

## What it connects to

| Setting        | Default      | What it does                                                                                      |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | **required** | Where PostgreSQL is.                                                                              |
| `REDIS_URL`    | **required** | Where Redis is. Sessions, rate limits, the locks between processes and the job queues live there. |

## Secrets

| Setting                   | Default      | What it does                                                                                                                                                             |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`              | **required** | Signs what the API hands out. At least 32 characters.                                                                                                                    |
| `PLAYBACK_SIGNING_SECRET` | **required** | Signs the addresses of media files and download links. At least 32 characters.                                                                                           |
| `MASTER_KEY`              | **required** | Encrypts what the database keeps secret: the keys of encrypted videos, and the settings of other services. 64 hexadecimal characters. Losing it loses what it encrypted. |

## The site

| Setting            | Default                                                                  | What it does                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`         | empty                                                                    | Address of the viewer website as people open it, for example https://watch.example.com. The links in emails lead there.                                                                     |
| `SITE_NAME`        | `Onyx Stream`                                                            | Name of the site, as emails call it.                                                                                                                                                        |
| `ONYX_COMMIT`      | empty                                                                    | The commit the installation was built from. Written to .env by the installer and by onyx update. Empty when the installation was made by hand: the panel then shows the version without it. |
| `UPDATE_CHECK`     | `on`                                                                     | Whether the panel may ask whether a newer version exists. It is one request without any detail of the installation, to the address below.                                                   |
| `UPDATE_CHECK_URL` | `https://api.github.com/repos/abbasspark/spark-onyx-stream/commits/main` | Answers with the newest commit, as plain text. The default is the project on GitHub.                                                                                                        |

## Files and media

| Setting                | Default            | What it does                                                                                                                                                                                     |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `STORAGE_LOCAL_PATH`   | `./storage`        | Folder of the storage pool that comes with the installation.                                                                                                                                     |
| `UPLOAD_TEMP_PATH`     | `./uploads`        | Folder uploads are collected in before they move into a storage pool.                                                                                                                            |
| `PROCESSING_TEMP_PATH` | `./tmp/processing` | Directory for the working files of processing jobs. Needs room for a source file and its outputs.                                                                                                |
| `UPLOAD_MAX_BYTES`     | `50 * 1024 ** 3`   | Largest accepted source file, in bytes. The default is 50 GiB.                                                                                                                                   |
| `MEDIA_BASE_URL`       | empty              | Origin that serves media files, for example https://media.example.com. Empty means the API itself, and playback URLs are then relative paths.                                                    |
| `GATEWAY_INTERNAL_URL` | empty              | Where the API reaches the gateway in front of it, such as http://gateway:8080, to read what the gateway sent to viewers itself. Empty where there is no gateway: that share is then not counted. |
| `FFMPEG_PATH`          | `ffmpeg`           | The ffmpeg program, when it is not on the path.                                                                                                                                                  |
| `FFPROBE_PATH`         | `ffprobe`          | The ffprobe program, when it is not on the path.                                                                                                                                                 |

## Playback

| Setting                    | Default       | What it does                                                                                                                                                                           |
| -------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLAYBACK_URL_TTL_SECONDS` | `6 * 60 * 60` | How long a playback URL stays valid, in seconds. Long videos get more time automatically.                                                                                              |
| `CATALOG_PLAYBACK`         | `open`        | Who may play published titles through the public catalog. open: anyone who can reach the site. viewers: only signed-in viewers. off: nobody. The catalog can be browsed in every case. |
| `STREAM_LIMIT`             | `0`           | On how many devices one viewer account plays at the same time. 0: no limit. A plan, and an admin for a single viewer, can say otherwise.                                               |
| `PLAYBACK_REPORTS`         | `on`          | Whether players report how playback went, for the quality figures in the panel. off records nothing: players get no place to report to.                                                |
| `PLAYBACK_REPORTS_DAYS`    | `90`          | How long a report is kept, in days. 0 keeps them for good.                                                                                                                             |

## Viewers

| Setting                     | Default    | What it does                                                                                                                                                                                          |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIEWER_REGISTRATION`       | `open`     | `open`: anybody can make an account on the website. `closed`: only an admin can, in the panel.                                                                                                        |
| `VIEWER_EMAIL_VERIFICATION` | `optional` | Whether a viewer must confirm their email address before they can watch. Only has an effect on playback that needs a viewer (CATALOG_PLAYBACK=viewers). required needs email to be set up (SMTP_URL). |
| `WATCH_SETTLE_SECONDS`      | `60`       | How long a file in a watched folder must have been left alone before it is imported, in seconds. Keeps a file that is still being copied from being picked up.                                        |
| `VIEWING_STATISTICS`        | `on`       | Whether it is recorded what is watched, for the figures in the panel. off records nothing: the figures stay empty.                                                                                    |
| `VIEWING_STATISTICS_DAYS`   | `730`      | How long a record of a play is kept, in days. 0 keeps them for good.                                                                                                                                  |

## Admins

| Setting            | Default    | What it does                                                                                                                    |
| ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_TWO_FACTOR` | `optional` | Whether every admin has to use two-factor sign-in. With required, an admin without it can sign in and do nothing but set it up. |

## Billing

| Setting                 | Default                  | What it does                                                                                                                                                                                                                             |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BILLING_CURRENCY`      | `EUR`                    | Currency of all prices, as three capital letters such as EUR or USD. Decide before the first plan: prices are stored as numbers and do not convert themselves.                                                                           |
| `BILLING_CONTACT_URL`   | empty                    | Where viewers ask for a subscription while there is no online payment: a web address or mailto:billing@example.com. Empty shows no link.                                                                                                 |
| `RENTAL_START_DAYS`     | `30`                     | Renting a title: how many days a viewer has to start watching, and how many hours to finish once they started.                                                                                                                           |
| `RENTAL_WATCH_HOURS`    | `48`                     | Hours a rental runs once the viewer has started it.                                                                                                                                                                                      |
| `STRIPE_SECRET_KEY`     | empty                    | Secret key of a Stripe account, to sell subscriptions online. It starts with sk_test_ while testing and sk_live_ for real payments; a restricted key (rk_) works too. Empty means no online payment: access is then granted by an admin. |
| `STRIPE_WEBHOOK_SECRET` | empty                    | Signing secret of the webhook endpoint at Stripe, which starts with whsec_. Stripe reports renewals, cancellations and failed payments to that endpoint, and this proves a report is from Stripe.                                        |
| `STRIPE_AUTOMATIC_TAX`  | `false`                  | Lets Stripe Tax work out the tax of each payment. Needs Stripe Tax set up in the Stripe account. Prices of plans then include the tax.                                                                                                   |
| `STRIPE_API_URL`        | `https://api.stripe.com` | Where Stripe is called. Changed only by tests.                                                                                                                                                                                           |

## Metadata

| Setting             | Default                        | What it does                                                                                                                                                                         |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TMDB_API_TOKEN`    | empty                          | Access to The Movie Database (TMDB), to import details and artwork of titles. Either the API Read Access Token or the shorter API Key of a TMDB account. Empty turns the import off. |
| `TMDB_API_URL`      | `https://api.themoviedb.org/3` | Where TMDB is called. Changed only by tests.                                                                                                                                         |
| `TMDB_IMAGE_URL`    | `https://image.tmdb.org/t/p`   | Where the pictures of TMDB are fetched from.                                                                                                                                         |
| `METADATA_LANGUAGE` | `en-US`                        | Language details are imported in when the admin does not choose one.                                                                                                                 |
| `METADATA_REGION`   | `US`                           | Country whose age ratings are imported, as two capital letters.                                                                                                                      |

## Mail

| Setting     | Default | What it does                                                                                                                                                                                                          |
| ----------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SMTP_URL`  | empty   | Mail server for the emails viewers get: confirming an address and setting a new password. For example smtps://user:password@smtp.example.com:465 or smtp://user:password@smtp.example.com:587. Empty turns email off. |
| `MAIL_FROM` | empty   | Sender of those emails, for example Onyx Stream <no-reply@example.com>.                                                                                                                                               |

## Notifications

| Setting              | Default | What it does                                                                                                                                                                                                           |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUSH_CONTACT`       | empty   | How a push service can reach whoever runs the installation, sent with every notification to a browser: mailto:… or an https address. Empty: SITE_URL when it is https. Some push services refuse a sender without one. |
| `PUSH_SERVICE_HOSTS` | empty   | More hosts notifications may be sent to, beyond the push services of the browsers and Firebase, separated by commas. A host with a port also allows plain http there. For tests and for push services not known here.  |

## Live television

| Setting                  | Default                 | What it does                                                                                                                                                                                        |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVE_PATH`              | `./tmp/live`            | Directory live channels write their playlists and segments to. Temporary files: a few megabytes per channel.                                                                                        |
| `INGEST_API_URL`         | `http://127.0.0.1:9997` | Control API of the ingest server (MediaMTX), as the API and the live processes reach it.                                                                                                            |
| `INGEST_RTSP_URL`        | `rtsp://127.0.0.1:8554` | RTSP address of the ingest server, as the live processes reach it.                                                                                                                                  |
| `INGEST_PUBLIC_RTMP_URL` | empty                   | Addresses encoders reach the ingest server at, as shown to admins: rtmp://stream.example.com:1935 and srt://stream.example.com:8890. Empty, the panel shows its own host name with the usual ports. |
| `INGEST_PUBLIC_SRT_URL`  | empty                   | The SRT address shown to whoever streams into a channel. Empty: SRT is not offered.                                                                                                                 |
| `GUIDE_REFRESH_HOURS`    | `6`                     | Hours after which the programme guide is imported again from its sources.                                                                                                                           |

## Sharing between players

| Setting                    | Default                                                         | What it does                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `P2P_TRACKER_URL`          | empty                                                           | Address players reach the tracker at, such as wss://stream.example.com/tracker. Empty switches P2P between viewers off.                                                                                            |
| `P2P_TRACKER_INTERNAL_URL` | `http://127.0.0.1:8070`                                         | Where the API reaches the tracker to read its figures.                                                                                                                                                             |
| `P2P_TRACKER_SECRET`       | empty                                                           | Shared with the tracker (its ONYX_TRACKER_SECRET), which lets in only players with a token signed with it.                                                                                                         |
| `P2P_STUN_URLS`            | `stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478` | STUN servers players ask for their own public address, which two viewers behind home routers need to reach each other. Separated by commas. Empty uses none, and then only viewers in the same network connect.    |
| `P2P_TURN_URLS`            | empty                                                           | TURN servers, which pass data on between two viewers who cannot reach each other directly: turn:turn.example.com:3478, several separated by commas. Empty uses none, and such viewers get everything from servers. |
| `P2P_TURN_SECRET`          | empty                                                           | The secret the TURN server makes short-lived passwords from (coturn: static-auth-secret). Players get a password that runs out with their video.                                                                   |
| `P2P_VIEWER_DEFAULT`       | `on`                                                            | Whether the players of viewers share until the viewer says otherwise. With off, a viewer has to switch sharing on in the player.                                                                                   |

## Webhooks

| Setting           | Default | What it does                                                                                                                                                     |
| ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WEBHOOK_TARGETS` | `any`   | Where outgoing webhooks may be sent. any includes private and local addresses, for a receiver on the same network. public allows only addresses on the internet. |

## Everything else

| Setting                  | Default    | What it does                                                                                                                                    |
| ------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVE_SEGMENT_SECONDS`   | `4`        | Wanted length of a live segment in seconds. Shorter means less delay and more requests.                                                         |
| `LIVE_PLAYLIST_SEGMENTS` | `6`        | Segments a live playlist lists. Players can go back this far.                                                                                   |
| `LIVE_TRANSCODE_PRESET`  | `veryfast` | Speed setting of the H.264 encoder for transcoded channels. Faster settings use less CPU and give a slightly worse picture at the same bitrate. |
| `WORKER_CONCURRENCY`     | `1`        | Processing jobs one worker process runs at the same time. Transcoding uses all CPU cores already.                                               |
