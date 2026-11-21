# Phase 4: Live

Live adds channels: streams that run around the clock, or for the length of an event, and that viewers join while they run.

It is built in steps. This document describes what is built so far: channels the server pulls from an address or that an encoder pushes to it, kept running by a live process, passed through untouched or transcoded into several qualities, with signed delivery and a page in the admin panel.

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
- Going back in time (DVR) and recording
- A programme guide (EPG)
- Channels in the catalog, in packages and on the viewer website
- Audio-only channels, several audio languages and subtitles
- Pictures of channels (logos, live thumbnails)
