# The player

The player is the part of the platform a viewer spends their evening with, so
it is held to a different standard from a screen that is visited for a minute.
This document says what it does, what belongs to the device and what belongs
to the account, and where to look when something is wrong.

There is one player for recordings — movies, episodes, trailers and extras —
in `apps/web/src/components/player/`, and one for live channels in
`apps/web/src/components/live-screen.tsx`. They share the settings menu, the
settings store, the figures panel, the gestures and the hardware hooks.

## Playing

HLS is played by `hls.js` where it runs, and by the browser itself where it
does not, which in practice means Safari on an iPhone. Everything below works
in both, except where it is said otherwise.

|                  |                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Quality          | The rungs the asset was encoded to, or automatic, which `hls.js` picks by the speed of the line and the size of the window |
| Sound            | Every audio track of the asset, named by its language                                                                      |
| Subtitles        | Every subtitle track, and off                                                                                              |
| Speed            | 0.5× to 2×, with the pitch of the sound kept                                                                               |
| Seek previews    | Small pictures from the sprite sheet of the asset, under the pointer on the bar                                            |
| Marked stretches | Recap, opening titles and credits, drawn across the bar and named under the pointer                                        |
| Next episode     | Offered while the credits run, and started by itself a few seconds after the end                                           |

## What a viewer sets

Two kinds of setting, kept in two places, because they behave differently.

**The profile** keeps the language of the sound and of the subtitles. A
viewer who watches in German wants German on every device, and a household
shares an account but not a taste, so these belong to the profile and travel
with it. They are sent to the API and come back on the next device.

**The device** keeps everything else: how big the subtitles are, how the
picture fills the window, how loud it may get, what is skipped by itself, how
much data a playback may use. How far away the screen is and what the
connection costs are facts about the device, not about the person, and a
phone and a television rarely want the same answer. These live in
`localStorage` under `onyx.web.player`, read by `lib/player-settings.ts`, and
every player on the page follows a change at once.

A stored file is read field by field. A setting the player no longer offers,
or a number outside what its control allows, falls back on its own without
the rest being thrown away, so an older or a newer version of the player
leaves a viewer's other settings alone.

### Subtitles

Size, colour, how the text is set off from the picture, how high it sits and
a timing offset.

The browser draws subtitles itself from the cues of a text track, and almost
nothing about that is reachable from CSS. What can be reached goes through
the `::cue` rule, which the player feeds with custom properties, and the size
is worked out against the height of the player rather than the height of the
window so that a small window and a full screen read the same.

Where a line sits and when it shows are not CSS at all: both belong to the
cue. So the player goes over the cues of the showing track, moves them by the
offset and puts them at the height that was asked for. It remembers what each
cue said to begin with, so changing the offset twice does not move a line
twice, and it leaves alone any cue the subtitler placed himself — a sign on a
wall, a speaker at the top of the picture.

### Picture and sound

Fit, fill, zoom and stretch, for letterboxed and 4:3 material. Brightness,
which only ever darkens: a page cannot make a screen brighter than it is.

Sound louder than the recording, and a night mode that pulls the loud parts
down so that speech can be heard quietly. Both run through Web Audio. A video
can be taken into Web Audio only once and it cannot be taken back out, so the
chain is built the first time one of the two is asked for and kept
afterwards; switching them off runs the chain flat rather than taking it
apart. Nothing is built while the picture is playing on another device.

### Playing

Skipping openings and credits without being asked, each stretch passed over
only the first time, so a viewer who goes back into one on purpose stays
there. A cap on the picture, for a metered connection, which holds the ladder
down without taking the choice of a rung away. How far a skip moves. A sleep
timer, which can also be set to the end of what is playing, in which case
nothing that follows starts by itself.

## Hands and keys

On a phone the controls are in the way of the film, so the picture takes the
common gestures: a double tap on a side skips, and keeps going further with
each further tap; a finger at rest runs the picture at 2× until it is lifted;
a drag up and down sets the volume on the right and the brightness on the
left; a double tap in the middle fills the screen.

The keyboard is listed in the player itself, under `?`.

| Keys            |                                  |
| --------------- | -------------------------------- |
| `Space` `K`     | Play and pause                   |
| `←` `→` `J` `L` | Skip                             |
| `,` `.`         | One frame back and forward       |
| `↑` `↓`         | Volume                           |
| `0`–`9`         | Jump to that tenth               |
| `Home` `End`    | The beginning and the end        |
| `<` `>`         | Slower and faster                |
| `M`             | Mute                             |
| `C`             | Subtitles on and off             |
| `S`             | Skip the stretch that is running |
| `V`             | How the picture fills the window |
| `F`             | Full screen                      |
| `I`             | The small floating window        |
| `D`             | The figures behind the playback  |
| `?`             | The list of keys                 |

## The device

The small floating window is the standard call where there is one and
Safari's own presentation mode where there is not. Sending the picture to a
television is the Remote Playback API, with Safari's older AirPlay event as a
fallback; the button appears only once a device has answered, so it is never
offered where pressing it would find nothing.

## The figures panel

`D` opens what the playback is doing: the picture that is playing, which rung
of how many, the rate of the video and the rate the player thinks the line
can carry, how much is loaded ahead, how far behind live, frames lost, the
server the parts come from, the codecs, and what sharing between viewers is
contributing.

It reads once a second while it is open and nothing at all while it is
closed, and it changes nothing. It is the first thing to ask for when a
viewer writes in to say the picture keeps stopping: "4 of 4, 440 Mbps, 27
seconds loaded" and "1 of 4, 2 Mbps, 0.4 seconds loaded" are different
complaints with different answers.

## Live channels

The live player shares the menu, the settings, the figures panel, the
gestures and the hardware hooks with the one above, and adds what a channel
needs.

**Tuning.** Typing a number tunes to that channel, the way a remote control
does: `1` waits in case `12` is coming and tunes by itself when nothing
longer could follow. `P` flips back to the channel watched before. The arrows
step up and down the lineup. After every change a banner names the channel,
what is on, how far through it is and what follows, and then goes away.

**The guide.** `G` lays the guide over the picture, which keeps playing
behind it: a row per channel, time running to the right, a line at the
present moment, and the programme that is running shown with its progress.
Choosing a programme on another channel tunes to it. Choosing one that has
already been sent, on a channel that keeps what it sent, goes back to where
it began — those are marked, so a viewer can see at a glance what is still
reachable.

**Going back.** On a channel with a DVR window the bar shows the whole of
what is kept, with a mark where each programme began, so that going back
lands on a beginning rather than in the middle. "Start over" returns to the
beginning of what is on, and a step back goes to the beginning of the one
before it. While the viewer is behind, the controls name what is actually on
the screen rather than what is on now.

**Favourites** are marked on a star, in the player, in the lineup and in the
guide. They sort to the top of every list. Like the rest of the player's
settings they belong to the device: the remote in the living room and the
phone in the kitchen do not watch the same things.

**Sound only** holds the channel at its smallest rung and turns the picture
off, for watching on a connection that is paid for by the megabyte.

| Keys                                |                                     |
| ----------------------------------- | ----------------------------------- |
| `0`–`9`                             | Tune to that channel number         |
| `↑` `↓`                             | The channel before and after        |
| `P`                                 | Back to the channel before this one |
| `G`                                 | The guide                           |
| `L`                                 | The list of channels                |
| `←` `→`                             | Back and forward in what is kept    |
| `Space` `K` `M` `V` `F` `I` `D` `?` | As above                            |

## Reporting

Separately from the panel, every playback reports how it went to the API,
which is what `docs/playback-quality.md` describes. The panel is for the
viewer and the operator in the moment; the report is for the figures
afterwards.
