# Viewing statistics

The panel shows what is watched on the website: how much, by how many, which titles, on what, and at what time of day. This page says what is recorded for that, what the figures mean, and how to turn it off.

## What is recorded

One row per play, in the table `plays`:

| Field                               | Meaning                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| Title, episode, kind                | What was played: the movie or episode itself, its trailer, or one of its extras    |
| When it began, and last report      | Two moments                                                                        |
| Length, time played, furthest point | Seconds                                                                            |
| Kind of device                      | Computer, phone, tablet, TV or other. Read from what the browser says, then let go |
| Paid                                | Whether the title needed a plan or a purchase                                      |
| Viewer                              | The account, when the viewer was signed in                                         |
| Visitor mark                        | For visitors who were not signed in: see below                                     |

**Not recorded:** the address of the device, the description of the browser, where the viewer is, what they searched or looked at without playing.

**The visitor mark** lets the same device be counted once a day without knowing which device it is. It is a hash of the address, the description of the browser, the day and a secret of the installation. Neither the address nor the browser can be read back from it, and the next day the same device gets another mark, so nothing ties the days of a visitor together.

**The viewer** is kept by account so that someone who watches on three days is one viewer and not three. When an account is deleted, its plays stay as figures and no longer say whose they were. The same holds for a deleted title: its views stay in the totals.

## How a play is recorded

1. When the website asks for the addresses to play a video, the API makes the row and answers with its id (`playId`).
2. While the video plays, the player reports about every half minute, and when the video ends or the page is left: where it is, and how many seconds played since the report before (`POST /v1/catalog/plays/{playId}/beat`).
3. The API adds that up. It does not believe more than can be true: time played cannot be more than the time that passed since the report before, one report adds a minute at most, and a play takes reports for a day.

Recording never stands in the way of watching. If the row cannot be made, the video plays and the play is not counted.

Plays in the panel (previews by admins) are not recorded. Live channels are not part of these figures yet.

## What the figures mean

| Figure              | Meaning                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| View                | A play of the movie or episode itself that lasted at least 30 seconds, or half of a video shorter than a minute |
| Viewers             | Different viewers among the views. An account counts once in the whole range, a visitor once per day            |
| Time watched        | Everything that played, also in plays too short to be a view                                                    |
| Per view            | Time watched in an average view                                                                                 |
| Watched to the end  | Views that played at least 85 % of the length of the video                                                      |
| How far viewers get | Of the views of a title, the share that reached 10 %, 20 % ... of the video                                     |
| Watching now        | Plays whose player reported in the last 90 seconds                                                              |

Every figure is compared with the same number of days right before. Days begin and end by the clock of whoever looks: the panel sends its time zone with each question.

## API

All under `/v1`, with the permission `analytics:read`, which every role has.

| Method and path              | Purpose                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /analytics/summary`     | Totals, the days before, one entry per day, devices, kinds of viewer, hours of the day           |
| `GET /analytics/titles`      | The titles that were watched, ranked by `views`, `viewers`, `watchSeconds` or `completion`       |
| `GET /analytics/titles/{id}` | One title: its days, its episodes, how far viewers get, its devices, plays of trailer and extras |
| `GET /analytics/now`         | How many are watching at this moment, and what                                                   |

`from` and `to` are days such as `2026-12-24`, both included, 400 days at most. `timezone` is a name such as `Europe/Berlin`. `type` narrows to `MOVIE` or `SERIES`.

## Settings

| Setting                   | Default | Meaning                                                           |
| ------------------------- | ------- | ----------------------------------------------------------------- |
| `VIEWING_STATISTICS`      | `on`    | `off` records nothing. Players get no `playId` and report nothing |
| `VIEWING_STATISTICS_DAYS` | `730`   | Days a row is kept. `0` keeps rows for good                       |

Rows of plays that never began are deleted after two days.

## For your privacy notice

If the law where you operate asks you to say what you record, this is it: for each play, the title, the time, how long it played, the kind of device, and, for signed-in viewers, their account. No address is stored. The figures are for running the service, and are not shared with anyone by this software.
