# Playback quality

The panel shows how watching goes: how fast videos start, how often they stop to load, in what quality they play and what breaks. Players report it. This page says what a player sends, what is kept, what the figures mean, and how to turn it off.

It is a different thing from [viewing statistics](viewing-statistics.md). Those say what is watched and by how many. This says how well it played, and names no viewer at all.

## How a playback is reported

1. Every answer with playback addresses carries a `qualityId`: for a movie, an episode, a trailer, an extra and a live channel. It is `null` when the installation takes no reports.
2. The player counts while it plays and sends what it counted to `POST /v1/playback/sessions/{qualityId}/report`: about every half minute, at once when the video has started, at once when a problem ends playback, and a last time with `ended: true` when the video ends or is left.
3. **Every report holds everything counted since the playback began,** not what changed since the report before. A report that is lost costs nothing, and sending one twice changes nothing.
4. The answer is always `204`, whether the playback is known or not. A playback takes reports for a day.

The request needs no sign-in and sends no cookie. It is limited to 240 a minute per address.

### What a report holds

| Field               | Meaning                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startupMs`         | Milliseconds from the wish to play to the first picture. Left out until the video started. The wish is the press on "Play", or the opening of the page when the video starts by itself |
| `played`            | Seconds the video actually played. Jumps add nothing                                                                                                                                   |
| `stalls`, `stallMs` | How often playback stopped to load **after it had started**, and for how long in all. Loading after the viewer jumped, and anything while paused, is not counted                       |
| `qualityChanges`    | How often the quality changed                                                                                                                                                          |
| `bitrateKbps`       | The average bitrate of the picture so far                                                                                                                                              |
| `height`            | The height of the picture it played in for the longest time, such as `1080`                                                                                                            |
| `droppedFrames`     | Frames the device skipped                                                                                                                                                              |
| `recoveredErrors`   | Problems the player got over by itself                                                                                                                                                 |
| `error`             | The problem that ended playback: `code`, and optionally `message` and `position` (seconds into the video)                                                                              |
| `ended`             | `true` in the last report                                                                                                                                                              |
| `player`            | `name` such as `web`, `android-tv`, `ios`, and optionally `version`                                                                                                                    |

`played`, `stalls`, `stallMs` and `qualityChanges` are always sent. Everything else is optional.

### The codes of problems

| Code          | Meaning                                                  |
| ------------- | -------------------------------------------------------- |
| `network`     | A playlist or a piece of the video could not be loaded   |
| `media`       | The device could not decode what it got                  |
| `unsupported` | The device cannot play this kind of video at all         |
| `expired`     | The addresses were refused: they ran out (401, 403, 410) |
| `key`         | The key of a protected video could not be had            |
| `timeout`     | Nothing arrived for too long and the player gave up      |
| `other`       | Anything else                                            |

An app may send a short word of its own (small letters, digits, dashes, up to 32). The panel shows it as sent.

### What the API does not believe

- Nothing lasted longer than the time since the addresses were handed out, plus ten seconds for clocks and the way.
- Counts and durations only grow. A late report cannot take anything back.
- The time to start is kept as first said, and a start of more than five minutes is not a start.
- What never started has not played and has not stalled.
- The first problem that ended playback is the one kept.
- **Addresses in a message are cut down to their host.** A signed address is a key to the video, so `https://edge.example.com/v1/media/…/seg_4.m4s` is kept as `https://edge.example.com/…`. Messages are cut to 300 characters.

## What is kept

One row per playback, in the table `playback_sessions`: what was played (title, episode or channel), the kind of device, the server the player was sent to (`origin` for the main server, otherwise the host of the edge), what the player says it is, and the figures above.

**Not kept:** the account, the profile, the address of the device, the description of the browser. A row cannot be traced to a viewer. That is why this is on by default and separate from the viewing statistics.

A playback no player ever reported on is deleted after two days. Reported ones are kept for `PLAYBACK_REPORTS_DAYS`. When a title or channel is deleted, its rows stay as figures and no longer say what they were of.

## The figures

Only playbacks a player reported on are counted. One that was asked for and never heard of again says nothing either way.

| Figure                  | How it is counted                                                                                      | Good up to | Poor above |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ---------- | ---------- |
| **Time to start**       | The middle of all times to start (half were faster). The panel also shows what 95 of 100 stayed within | 2 s        | 4 s        |
| **Waiting**             | Time spent stalled, divided by time played plus time stalled                                           | 0.5 %      | 2 %        |
| **Failed to start**     | Playbacks a problem ended before the first picture, of all playbacks                                   | 1 %        | 3 %        |
| **Broke while playing** | Started playbacks a problem ended, of all that started                                                 | 1 %        | 3 %        |

- **Left before it started** is counted apart: the viewer went away while it was loading, and no problem was reported. It is not a failure, but it grows when starts are slow.
- A figure is graded from 10 playbacks on. Below that it is shown and not graded.
- Against the days before, shares are compared in points and the time to start in percent. Less is better for all four.
- Over more than 100 days the chart adds days up by week. The time to start of a week is the average of its days, weighted by how many started.

`GET /v1/analytics/quality` answers the totals, the same for the stretch before, one entry per day, the figures per kind of device, per server and per player, the time played per height of picture, the problems by code, and the titles and channels with the most trouble (those played at least five times). `GET /v1/analytics/quality/failures` lists the playbacks a problem ended. Both take `from`, `to`, `timezone`, and optionally `kind` (`VIDEO` or `LIVE`), `device` and `server`, and need `analytics:read`.

## Reading it

- **Poor on one server:** that server, or the way to it. Compare under "Compared → Servers".
- **Poor on one kind of device, or from one version of an app on:** the device or that release. Compare under "Devices" and "Players".
- **One title with many failures:** its file. "Device cannot play it" and "Could not decode" on one title usually mean a codec some devices lack.
- **"Addresses refused":** signed addresses ran out during long pauses, or the clocks of the servers disagree.
- **A low picture and much waiting together:** connections that cannot keep up with the lowest quality offered. A lower rung in the encoding profile helps.

## Settings

| Setting                 | Default | Meaning                                                              |
| ----------------------- | ------- | -------------------------------------------------------------------- |
| `PLAYBACK_REPORTS`      | `on`    | `off` records nothing. Players get no `qualityId` and report nothing |
| `PLAYBACK_REPORTS_DAYS` | `90`    | Days a report is kept. `0` keeps reports for good                    |

## Not built yet

- Alerts when a figure turns poor
- The country or network of a viewer. Neither is recorded
- Figures per rung of the encoding ladder, and per sound or subtitle track
- Reports from the preview player of the panel
