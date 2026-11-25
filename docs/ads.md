# Ads

Ads play before, during or after movies and episodes, to viewers who have not paid to avoid them. They are off until an administrator turns them on.

## Who sees ads

An ad is shown only when all of these hold:

- Ads are switched on and at least one source is active.
- The video is a movie or an episode. Trailers and extras never carry ads, and neither do live channels (see [What is not built](#what-is-not-built)).
- The video is at least as long as the shortest length set (ten minutes by default).
- The viewer has no running subscription to a plan that removes ads, and has not bought or rented the title.

Plans remove ads by default. Switch **Watch without ads** off on a plan to make a cheaper plan that ads pay for.

## Where breaks fall

| Setting                   | Effect                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| Before the video          | One ad before the first frame. On by default.                                                   |
| After the video           | One ad when the video has ended.                                                                |
| An ad every N minutes     | Breaks during the video, never in the last five minutes and never over the credits. 0 for none. |
| Leave videos shorter than | Shorter videos are not interrupted at all.                                                      |

A video has at most eight breaks. A break in the middle fires only when playback reaches it. Seeking past it skips it.

## Sources

Each break takes one ad from the active sources, chosen at random in proportion to their weights.

- **Ad network.** A VAST tag from an ad server. The server fetches it when the break comes, follows wrapper chains up to five steps, and gives the player one video file, its tracking addresses, its click-through address and its skip offset. The tag itself never reaches viewers, and no browser request is made to the ad server, so no CORS setup is needed there.
- **Your own video.** A ready video from the library, with an optional link for "Visit advertiser" and an optional number of seconds after which it can be skipped.

VPAID and ads made of several videos (pods) are not supported. A VPAID file is never chosen, and a tag that has nothing else is treated as empty, so the break is skipped.

## What the server will not fetch

Tags are fetched from the server, so they are checked as carefully as webhooks are:

- Only http and https. Addresses that are never meant to be reached, such as loopback and link-local ones, are always refused.
- Addresses on a private network are allowed for the tag an administrator typed, so an ad server in your own network works, but never for addresses found inside an answer.
- Four seconds per request, 512 KB per answer, three redirects, five wrapper steps.

## Content security

The site's content security policy lets ads load pictures and video only from hosts named in `WEB_AD_ORIGINS` (`AD_ORIGINS` in the Compose file). Hosts are separated by commas. `*` allows any https host, which is the practical choice with an ad network whose files lie on many hosts. It is empty by default, and `connect-src` is never widened: players report ads with picture requests, not with scripts.

Your own house ads are served from your own installation and need no entry.

## What is counted

Players report started, quarter, half, three quarters, complete, skip, click and error for each source. The panel shows these per day and per source. They are what players say happened, so a viewer who closes the tab during an ad is counted as having started it and nothing more. Counts are never used to bill anyone.

## In the Android apps

The television and the phone app follow the same plan and the same rules as the website. The server resolves the ad, and the app plays the file in the player that plays the video: the video is swapped for the ad and loaded again where it stopped. No ad SDK is used.

- On the phone an ad shows **Visit advertiser**, which opens the link in the browser, and **Skip ad** once the ad allows it.
- On the television the remote can only skip. There is no browser to open a link in, so an ad's link is not offered and clicks are not counted there.
- An ad that does not start within eight seconds, or cannot be read, is dropped and the video goes on.

None of this has been run on a device or an emulator. It compiles and the rules are covered by unit tests, but how Media3 behaves when it changes from one file to another on real hardware is not verified.

## What is not built

- **Live channels.** An ad in a live stream has to be spliced into the stream on the server, so that every viewer's player sees one continuous stream. That is a larger piece of work than the player-side ads here.
- **Per-title opt-out and hand-placed breaks.** Breaks are placed by the settings above only.
- **Tests against a real ad network.** The player and the VAST handling have been run against a local ad server and a local video, in Chrome, not against Google Ad Manager or another network, and not in Safari.
- **Replay.** Watching again from the end of the video does not show the ad before the video a second time.
