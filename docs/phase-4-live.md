# Phase 4: Live

Live adds channels: streams that run around the clock, or for the length of an event, and that viewers join while they run.

It is built in steps. This document describes what is built so far: channels the server pulls from an address or that an encoder pushes to it, kept running by a live process, passed through untouched or transcoded into several qualities, with signed delivery, a page in the admin panel, the channels on the viewer website for those who may watch them, and the programme guide.

## Model

- **Channel**: a name, an optional number as on a remote control, a name for addresses, and a source.
- **Processing**: a channel is passed through or transcoded. A transcoded channel has a list of qualities.
- **Where the video comes from**: the server pulls it from an address, or an encoder pushes it to the server with a stream key.
- **Source**: the address a pulled channel comes from. It is stored encrypted with the master key, because it often carries a password, a token or a stream key. Lists, logs, messages and the audit log only ever show a form without those parts.
- **Wanted state**: a channel is switched on or off by an admin. A channel that is on is kept running. Nothing else decides whether a channel runs.
- **Reported state**: what the live process last said about a channel that is on.

| State          | Meaning                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| `STOPPED`      | Switched off                                                                           |
| `WAITING`      | Switched on, and no live process reports on it. Not stored: the API works it out       |
| `IDLE`         | Switched on and waiting for its encoder. Only for pushed channels                      |
| `STARTING`     | A live process connects to the source                                                  |
| `RUNNING`      | Data arrives and segments are written                                                  |
| `RECONNECTING` | The stream broke or the source is away. The next attempt is on its way                 |
| `FAILED`       | Five attempts in a row failed, or the source cannot be repackaged. It is still retried |

## Sources

| Protocol    | Typical use                                                       |
| ----------- | ----------------------------------------------------------------- |
| HTTP, HTTPS | An HLS playlist of another server, or a continuous MPEG-TS        |
| RTMP, RTMPS | A stream on a media server or at a provider                       |
| SRT         | A contribution feed over the internet, in caller or listener mode |
| RTSP, RTSPS | An IP camera or another media server, read over TCP               |
| UDP, RTP    | A broadcast feed in a local network, also multicast               |

Nothing else is accepted. A path, `file:`, `concat:`, `pipe:` and the like would let an admin read files of the server through a channel. FFmpeg is also started with a list of allowed protocols per kind of source, so a playlist on a web server cannot send it to local files either.

The server connects to whatever address an admin enters, including addresses inside its own network. The right to change channels (`live:write`) is therefore given to owners and admins only. Editors and viewers of the panel can look at channels and watch them.

**Test source** in the form connects to an address for up to 15 seconds and reports what it carries, before anything is created.

## Channels pushed by an encoder

A studio, an event or a camera crew does not have an address to pull from. They run an encoder (OBS, vMix, a hardware encoder) that connects to the server and sends. Such a channel has no source address. It has a **stream key**.

| What the encoder needs | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| Server (RTMP)          | `rtmp://<host>:1935/live`                              |
| Stream key             | 32 characters, from the details of the channel         |
| SRT, as one address    | `srt://<host>:8890?streamid=publish:live/<stream key>` |

- **The key is the only thing an encoder needs,** and anyone who has it can send to the channel. It is stored encrypted and as a hash, shown only to those who may change channels, and never written to the audit log.
- **A channel that is switched off refuses its encoder.** The operator of the encoder sees at once that the channel is off, instead of streaming into nothing.
- **A channel that is switched on waits.** Its state is `IDLE` until an encoder connects, and it goes back to waiting when the encoder disconnects. Waiting is not a failure and is not counted as one.
- **A new key** can be made at any time. The old one stops working at once, and an encoder connected with it is disconnected. Stopping or deleting a channel disconnects its encoder as well.
- **Pass through or transcode** applies as for pulled channels. An encoder that sends H.264 with AAC, the usual default, can be passed through.

### The ingest server

Streams from encoders are received by [MediaMTX](https://github.com/bluenviron/mediamtx), a small open-source media server, running as its own container (`ingest`). It does one thing here: take streams in. Its settings are in `deploy/mediamtx/mediamtx.yml`.

- **It asks the API before every connection** (`POST /v1/live/ingest/auth`). An encoder may publish to `live/<stream key>` when that key belongs to a pushed channel that is switched on.
- **The live process reads the stream from it over RTSP** and from there treats the channel like any other. It asks the control API of the ingest server whether an encoder is sending, once a second per waiting channel.
- **Reading and the control API are for the platform only.** It signs in with a password made from `PLAYBACK_SIGNING_SECRET`, so there is nothing to configure. Their ports are not published.
- **Viewers never reach it.** Channels go out through the gateway as HLS, like all others.

The address the API answers at is open to anyone who can reach the API, and that is harmless: it only says yes to someone who already holds a stream key or the platform's password.

When the ingest server is down, pushed channels wait and say why. Pulled channels and video on demand do not notice.

In development, `pnpm dev:infra` starts an ingest server beside PostgreSQL and Redis.

## Processing

One FFmpeg process per channel reads the source and writes HLS with fMP4 segments (decision D-010). There are two ways to run a channel, chosen per channel.

### Pass through

The picture is never re-encoded.

- **Video** must be H.264 or HEVC and is passed on untouched. A source with other video, such as MPEG-2, is reported as failed with the advice to switch to transcoding.
- **Audio** in AAC is passed on untouched. Anything else, such as MP2 or AC-3 from broadcast feeds, is encoded to AAC, because browsers play neither. This costs very little.

This costs almost no CPU: one server carries many channels. The price is that viewers get the one quality the source sends.

### Transcode

The picture is encoded again as H.264, in each of the qualities chosen for the channel. Players switch between them as the connection allows.

| Quality | Video bitrate |
| ------- | ------------- |
| 1080p   | 5 Mbit/s      |
| 720p    | 2.8 Mbit/s    |
| 480p    | 1.4 Mbit/s    |
| 360p    | 800 kbit/s    |
| 240p    | 400 kbit/s    |

- **Any video the server can read is accepted,** MPEG-2 included.
- **A picture is never made larger than the source.** Chosen qualities above it are left out. When that cuts the top off, the height of the source takes its place: a 576-line broadcast with 1080p, 720p and 480p chosen comes out as 576p and 480p. The panel shows what a channel is really encoded into.
- **Sources at 50 or 60 pictures a second** get 40 percent more from 720p up.
- **Interlaced pictures are made whole** before scaling. Pixels that are not square are made square.
- **Key frames sit at the same moments in every quality,** every two seconds, so players can switch at any segment.
- **Audio** is encoded to AAC, stereo at most, once per quality.
- **The encoder** is x264 with the speed setting `LIVE_TRANSCODE_PRESET` (`veryfast`).

Transcoding costs CPU for every quality, all the time the channel runs. How much depends on the server, the source and the qualities, and has not been measured for this project yet: try a channel on your own server before planning with it. When a server cannot keep up, the channel falls behind the source and viewers see pauses. The panel shows the pace of each channel and warns when it stays below real time.

`index.m3u8` is the address players open either way: the playlist itself for a channel that is passed through, the list of qualities for a transcoded one. Changing the processing of a running channel restarts it.

### Both

- **Segments** are as close to `LIVE_SEGMENT_SECONDS` (4) as possible. A channel that is passed through can only cut where the source has key frames. The playlist lists `LIVE_PLAYLIST_SEGMENTS` (6) of them, and older ones are deleted.
- **Segment numbers follow the clock**, so they keep rising across restarts and a player that is watching goes on instead of starting over.
- **Delay** behind the source is a few segments, 15 to 25 seconds with the defaults.

The files are written to `LIVE_PATH`, one folder per channel. They are temporary: a few megabytes per quality, removed when the channel stops.

## Channels for viewers

A channel is for admins only until it is **published**. A published channel is in the public catalog, on the website under **Live**, and later in the apps.

| Setting   | Meaning                                                                                |
| --------- | -------------------------------------------------------------------------------------- |
| Published | Viewers find the channel. Off for a new channel                                        |
| Access    | `FREE`: as open as the installation (`CATALOG_PLAYBACK`). `PAID`: needs a plan         |
| Packages  | A paid channel is opened by plans that include one of its packages, as a paid title is |

The rules are those of titles, on purpose: a plan with the package "Sports" opens the films and the channels in it. A paid channel in no package is opened only by plans that open everything. A channel cannot be rented or bought on its own.

| Method and path                            | Purpose                                          |
| ------------------------------------------ | ------------------------------------------------ |
| `GET /v1/catalog/channels`                 | Published channels in the order of their numbers |
| `GET /v1/catalog/channels/:slug`           | One of them                                      |
| `POST /v1/catalog/channels/:slug/playback` | A signed address for watching                    |

Viewers are told the name, number, description, whether a channel is paid and in which packages, and whether it is on air. Nothing about where its video comes from leaves the API. The list may be cached for ten seconds, a shorter time than the rest of the catalog, because being on air changes at any moment.

Asking to watch answers 401 without a viewer where one is needed, 402 with `subscription_required` or `plan_required`, 403 with `email_unverified`, and 409 with `off_air` for a channel that is not sending. Who may watch is checked before whether the channel is on air, so the state of a paid channel is not told to those it is closed to.

On the website, **Live** lists the channels as a lineup, with what is on air and a mark on those that need another plan. The page of a channel plays it over the whole window, with the lineup one key away and the arrow keys for the channel before and after. A channel that is off air is waited for: the picture starts by itself. When a signed address runs out during a long session, the player asks for a new one and goes on.

## Going back in time

A channel can keep what it sent for a while, so viewers can pause, rewind and start the running programme over. It is a setting per channel: off, or 30 minutes, 1, 2 or 4 hours.

- **How it works:** the playlist of such a channel lists every segment of the chosen time instead of the last few, and segments are deleted when they leave it. Players start at the present as before and can move back through the rest.
- **Start over:** segments carry the time they were sent. With the guide, the player knows where the running programme began and offers to play it from there, as long as that moment is still kept.
- **Disk space:** everything sent in the chosen time is on disk, for each quality: about 2 GB per hour at 5 Mbit/s. The details of a channel show the figure for its real bitrate.
- **A restart of the stream empties it.** When the source breaks, the channel is restarted or its settings change, the window starts again from nothing. Keeping it across restarts would need joining streams that may differ, which is left for later.
- **Changing the setting restarts a running channel.**
- **The playlist is long:** 3600 entries for four hours of 4-second segments, fetched by every viewer every few seconds. The gateway sends it packed, which makes it about a tenth of the size.

On the website the player of such a channel has a bar for the kept time, shows how far behind the present the viewer is, and takes the left and right arrow keys for ten seconds back and forth. The preview in the panel can be scrubbed the same way.

## Recording

A stretch of a channel can be kept as a video in the library: a programme of the guide, or any time range on a channel.

- **What a recording is:** a channel, a title, a start and an end. It waits until its start, records while the channel is on air, and ends as an asset in the library, which is processed like an upload and can be attached to a title.
- **No second encode:** the recording is cut from the files the channel already makes for viewers. On a channel with several qualities the best one is recorded, and processing makes the other qualities of the video from it.
- **A start in the past** works as far back as the channel keeps (see going back in time), at most four hours. On a channel that keeps nothing, recording starts from the present.
- **Interruptions:** when the source drops, the recording waits and goes on when the channel is back. The pieces are joined, so the video is shorter than planned by what was missed. If the channel was not on air at all, the recording fails two minutes after its end and says so.
- **Limits:** eight hours per recording. The same title at the same time on the same channel is planned once.
- **Stopping** a running recording keeps what was recorded. Calling a planned one off makes nothing. Removing a recording from the list leaves its video in the library, and deleting a channel keeps its recordings.
- **Changes to the guide do not move a planned recording.** It keeps the times the programme had when it was planned.
- **Disk space:** while it runs and is joined, a recording lies under `LIVE_PATH/recordings` and can take up to twice its size there. Then it is written to the default storage pool and removed.
- **Who records:** the live process that runs the channel. A lock makes sure one process holds a recording, and after a restart of that process the recording goes on with the pieces it already has.

| Method and path                  | Permission   | Purpose                                              |
| -------------------------------- | ------------ | ---------------------------------------------------- |
| `GET /v1/recordings`             | `live:read`  | Recordings, all, open or finished                    |
| `POST /v1/recordings`            | `live:write` | Plan a recording by channel and time                 |
| `POST /v1/programmes/:id/record` | `live:write` | Record a programme of the guide                      |
| `POST /v1/recordings/:id/stop`   | `live:write` | Call a planned one off, or stop a running one        |
| `DELETE /v1/recordings/:id`      | `live:write` | Remove from the list. The video in the library stays |

In the panel, **Live → Recordings** lists them with their state and a link to the video, and the guide has a record button beside every programme that is not over.

## The programme guide

The guide says what each channel shows and when. Viewers meet it in three places: "now" and "next" in the lineup, the name of the running programme in the player, and the guide of the day as a timetable.

### Where programmes come from

- **Guide sources**: files in the XMLTV format at a web address, which is how guide providers deliver. A source is fetched when it is added, again every `GUIDE_REFRESH_HOURS` (6) by the scheduler, and whenever an admin asks. Packed files (gzip) are unpacked, whatever their name.
- **By hand**: an admin enters a programme for a channel. This is for channels no provider covers, such as the operator's own.

A channel is **linked** to a source by the id the source uses for it (`guideId`). After its first import, a source lists the channels it knows, and the panel offers them when a channel is linked. Only programmes of linked channels are kept, from six hours back to fourteen days ahead.

- **An import replaces what the source brought before,** as a whole, so nothing the provider dropped stays behind. Programmes entered by hand are never touched.
- **A failed import changes nothing.** The guide of the last good import stays, and the source shows what went wrong.
- **Imported programmes cannot be changed here.** The next import would undo the change, so they are changed at the provider.
- **The address of a source is stored encrypted** and shown without its query, where tokens usually are. Only http and https addresses are taken.
- **Files are read piece by piece,** so a guide of hundreds of megabytes needs little memory. A file larger than 400 MB unpacked is not read to its end.
- **Programmes that ended more than two days ago are deleted.**

When two sources, or a source and a hand-made entry, describe the same slot of a channel, viewers are shown the one that starts first.

### API

| Method and path                           | Permission   | Purpose                                         |
| ----------------------------------------- | ------------ | ----------------------------------------------- |
| `GET /v1/guide/sources`                   | `live:read`  | Sources with the result of their last import    |
| `POST /v1/guide/sources`                  | `live:write` | Add a source                                    |
| `GET /v1/guide/sources/:id/url`           | `live:write` | The full address of a source, for the edit form |
| `PATCH /v1/guide/sources/:id`             | `live:write` | Change a source                                 |
| `DELETE /v1/guide/sources/:id`            | `live:write` | Delete a source with everything it brought      |
| `POST /v1/guide/sources/:id/import`       | `live:write` | Import now. Answers when the import is done     |
| `GET /v1/guide/channels?q=`               | `live:read`  | Channels the sources know, to link to           |
| `GET /v1/channels/:id/programmes?from&to` | `live:read`  | Programmes of a channel in a stretch of time    |
| `POST /v1/channels/:id/programmes`        | `live:write` | Enter a programme by hand                       |
| `PATCH /v1/programmes/:id`                | `live:write` | Change one that was entered by hand             |
| `DELETE /v1/programmes/:id`               | `live:write` | Delete one that was entered by hand             |

For viewers, `GET /v1/catalog/channels` carries `now` and `next` for each channel, and `GET /v1/catalog/guide?from=&hours=` gives the programmes of all published channels in a stretch of up to 48 hours, by default 24 hours from an hour ago.

### In the panel and on the website

**Live → Guide** shows the day of a channel programme by programme, with what is on now, lets an admin link the channel to a source and enter programmes by hand, and lists the sources with the result of their last import.

On the website, the lineup shows what is on and what is next with a bar for how far it has run. **The guide for today** is a timetable with a row per channel and a line at the present moment. Times are shown in the viewer's own time zone.

## The live process

Processes with the `live` role keep the channels running. In development one process has every role. The Compose file starts a `live` container of its own.

- **The database says what should run.** Every two seconds, and at once when an admin changes something, a live process compares the channels that are switched on with the FFmpeg processes it has, and starts or stops what differs. It remembers nothing between its own restarts: after a crash it starts the channels again.
- **A watchdog per channel.** A process that delivers nothing for 20 seconds is stopped and started over, as is one that ends by itself.
- **Growing waits.** After a problem the next attempt comes after 1, 2, 5, 10 and then every 30 seconds. A run of half a minute counts as healthy and the waits start short again.
- **A channel is never given up.** Live sources come back, sometimes after hours. A channel that has to be started by hand again is a channel that is down.
- **A changed source or a restart** asked for by an admin replaces the process.
- **Nothing is left behind.** A live process that is stopped ends its FFmpeg processes. One that is killed cannot, so before a channel is started, an FFmpeg still writing into its folder is ended first.
- **Several live processes** can run. A lock in Redis that has to be renewed decides who runs a channel. When a process dies, its locks run out within ten seconds and another one takes the channels over.
- **Figures** of each running channel (bitrate, pace, the latest log lines) are kept in Redis for a few seconds at a time. The state itself is written to the database when it changes.

A crash of a live process stops its channels until it, or another one, has started them again. It never touches video on demand, the API or other live processes.

## Delivery

```
/v1/live/<channelId>/<token>/index.m3u8
/v1/live/<channelId>/<token>/seg-1795287560.m4s
```

The token is the playback token of video on demand, signed over the id of the channel. It sits in the path, so the relative addresses in the playlist carry it to every segment. Every refusal is a plain 404, and only playlists, header files and segments are served.

The API serves these files in development. The Nginx gateway checks the same token and serves them straight from the folder of the live processes, without asking the API. The playlist is never cached. Segments may be kept for a minute.

In this step, addresses for watching are issued to admins only (`POST /v1/channels/:id/playback`), for the preview in the panel. Channels for viewers come with the catalog step.

## API

| Method and path                    | Permission   | Purpose                                           |
| ---------------------------------- | ------------ | ------------------------------------------------- |
| `GET /v1/channels`                 | `live:read`  | All channels with state and figures               |
| `POST /v1/channels`                | `live:write` | Create a channel, optionally starting it          |
| `POST /v1/channels/probe`          | `live:write` | Test a source                                     |
| `GET /v1/channels/:id`             | `live:read`  | One channel with the latest log lines             |
| `GET /v1/channels/:id/source`      | `live:write` | The full address of the source, for the edit form |
| `PATCH /v1/channels/:id`           | `live:write` | Change a channel. A new source restarts it        |
| `DELETE /v1/channels/:id`          | `live:write` | Stop and delete a channel                         |
| `POST /v1/channels/:id/start`      | `live:write` | Switch a channel on                               |
| `POST /v1/channels/:id/stop`       | `live:write` | Switch a channel off                              |
| `POST /v1/channels/:id/restart`    | `live:write` | Replace the running process                       |
| `GET /v1/channels/:id/encoder`     | `live:write` | What to enter in an encoder, with the stream key  |
| `POST /v1/channels/:id/stream-key` | `live:write` | Replace the stream key                            |
| `POST /v1/channels/:id/playback`   | `live:read`  | A signed address for watching                     |

Changes are written to the audit log, with the source in its form without secrets. Open panels learn about changes through the event stream (`channel` events).

## Settings

| Setting                  | Default                 | Meaning                                                                           |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------- |
| `LIVE_PATH`              | `./tmp/live`            | Folder of playlists and segments                                                  |
| `LIVE_SEGMENT_SECONDS`   | `4`                     | Wanted length of a segment, 1 to 10                                               |
| `LIVE_PLAYLIST_SEGMENTS` | `6`                     | Segments in the playlist, 3 to 60                                                 |
| `LIVE_TRANSCODE_PRESET`  | `veryfast`              | Speed of the encoder for transcoded channels, `ultrafast` to `medium`             |
| `GUIDE_REFRESH_HOURS`    | `6`                     | Hours after which guide sources are imported again, 1 to 168                      |
| `INGEST_API_URL`         | `http://127.0.0.1:9997` | Control API of the ingest server, as the platform reaches it                      |
| `INGEST_RTSP_URL`        | `rtsp://127.0.0.1:8554` | Where live processes read pushed streams                                          |
| `INGEST_PUBLIC_RTMP_URL` | empty                   | Address for encoders as shown to admins, such as `rtmp://stream.example.com:1935` |
| `INGEST_PUBLIC_SRT_URL`  | empty                   | The same for SRT, such as `srt://stream.example.com:8890`                         |

With several servers, the live processes and the gateway need the same `LIVE_PATH`. Delivery through edges is phase 5.

## Admin panel

**Live → Channels** shows every channel with its number, source, state, picture and sound, bitrate and time on air, and what is wrong when something is. The list can be narrowed to channels on air, channels that need attention and stopped ones, and searched. The details of a channel show the live picture, its figures and the log of the live process. The form tests a source before it is saved, and offers the two ways to run a channel with the qualities to choose from.

## Not built yet

- Encoding on graphics cards, and qualities with bitrates of your own
- Pushing from a browser (WebRTC), and RTMPS
- Keeping what was sent across restarts of a stream
- Recording every episode of a series, recordings by viewers, and attaching a recording to a title in one step
- Pictures and age ratings of programmes, reminders, and uploading a guide file instead of an address
- Channels on the home page and in search, and how many people are watching
- Audio-only channels, several audio languages and subtitles
- Pictures of channels (logos, live thumbnails)
