# Phase 7: the apps

A platform people install on their own server needs clients they can give to
their viewers. There are three: one for Android TV, because that is where a
VOD service is actually watched, one for the phone, and a web app for Samsung
and LG televisions.

The two Android apps live in `apps/android`, with a README of its own for
building them. This document is about the decisions behind them. The Samsung
and LG app is a separate web project, described in [tv-web.md](tv-web.md).

## One project, two apps, one core

Everything behind a screen is the same on both: the API client, what a device
remembers, and every view model — starting up, the catalog, a title, playing,
live, searching, the saved list. All of it is in a `core` module that both
apps depend on, and an app is its screens and little else.

What is not shared is anything that would be a lie in the other place. A
television is read from three metres away and driven with four arrows; a phone
is read from thirty centimetres and driven with a thumb. So each app has its
own theme, its own type scale, its own navigation and its own player chrome,
built on the same palette and the same behaviour underneath.

That split is why the phone app is mostly screens. Searching, resuming,
reporting progress, tuning a channel, the arithmetic of a DVR window — none of
it was written twice, and a change to any of it changes both apps at once.

## It is a client of an installation, not of a service

There is no Spark Onyx Stream service to connect to. Every installation is
somebody's own, so the app has to learn which one it belongs to.

Two ways, and both are needed. An operator who publishes an app for their own
viewers builds it with the address inside it, and their viewers never see the
question. Anyone else — a household running their own server, an operator
before they have a store listing — types an address once on first run.

So the address is a Gradle property that the app falls back on, and the
screen that asks for it only appears when that property is empty. The same
goes for the name the launcher shows and the id the app installs under: all
three are set at build time, and the name, the logo and the accent colour of
the service come from the server at run time, so rebranding needs no build.

## Signing in: two devices, two ways

A television remote has four arrows. Spelling an email address with it is the
worst minute in any television app, so that app never asks.

The platform already had the answer: `POST /v1/viewer/device-codes` gives the
app a short code to show and a secret to ask with, and the viewer enters the
code on the website on the phone already in their hand. The app shows the code
as large as the screen allows, and a square beside it that a phone camera can
read, so that the usual path is: point phone, tap, done.

The server decides how often the app may ask whether the viewer has answered,
and the app obeys it: a room full of televisions must not be able to push a
small server over by asking faster. A code that runs out is replaced without
being asked, because the viewer is standing there with a phone in their hand.

The phone does the opposite, and for the same reason. It has a keyboard, and
it is the device somebody would reach for to approve a code anyway, so asking
for an email address and a password directly is one step instead of three. The
shared model takes which way it signs in as a setting; everything after that
is identical.

## Being turned away politely

An installation can refuse versions of an app it no longer trusts, by the
`X-Onyx-Client` header. That was built before there was an app to send it.

The app sends `android-tv/1.0.0` and asks `/v1/meta` before anything else.
That one address answers an app that is too old as well as one that is
current, which is what lets the television show the operator's own message
and the address of the newer version, rather than failing at whatever request
happened to come first.

## What a remote control can do

Everything in the app is built out of four arrows, a centre and a back key.
The media keys some remotes carry do what they say, and the next key skips the
opening or the credits when one is running.

Focus is marked one way everywhere: a border in the accent of the service,
with the card lifted slightly. A viewer across a room has to see where they
are without looking for it.

Nothing that must be read sits within 48dp of the side of the screen or 27dp
of the top and bottom, because some televisions still cut off the outermost
part of what they are sent.

## The look

The same stone as the website: true black, the warm white of the bands
running through it, the amber of sardonyx as the one accent, and colour from
the artwork rather than from the interface. The mark is the same three bands.

What changes is scale, not taste. Every size is larger than its counterpart
on the web, and nothing is set below 14sp, because a television is read from
three metres away.

## What is built, and what is not

Built, in both Android apps: the address, signing in (by code on the
television, by email and password on the phone), profiles with their PINs, the
home page with its opening and rows, "Continue watching", a title with its
seasons and episodes, search, the list a viewer saves, a settings screen, live
channels with the lineup, now and next, and going back in what a channel
keeps, and the player (HLS through Media3, resume, progress reported back
every half minute, and the opening and credits skippable). Both follow the ad
plan the server sends with a video and play ads before, during and after
movies and episodes. The television adds tuning by number, channel keys, the
channel banner and the guide over the picture.

Not built:

- Ads in live channels, which need the ad spliced into the stream on the
  server.
- Selling inside the apps. Viewers are sent to the website; roadmap item 10
  ("To decide") covers whether that changes.
- P2P delivery in the apps.
- An iOS or tvOS app.
- DRM, which is deferred.

The Samsung and LG app has fewer features: no search, saved list, profile
choice and PIN entry, live channels, subtitle and audio choice, markers or
ads. See [tv-web.md](tv-web.md).

## What has been checked

The Android apps compile, pass Android Lint, and their unit tests pass; CI runs both on every pull request. They have been run on an Android 14 phone emulator and an Android 13 TV emulator against a local server: signing in (by code on the television), the home page, a title and playing a video.

That first run found three faults that made both apps unusable, and no test or build could have shown them: the apps sent the server a description of the device it refused, so nobody could sign in; the session was read from a copy that was only filled at start-up, so the first request after signing in carried no token and the app then wiped it; and the server's addresses are paths that a browser reads against its site but a player reads as files. Each is fixed and has a test, the first two of them on a device. See the [Android README](../apps/android/README.md#what-has-been-checked).

They have not been run on a real television or phone. Live channels, search, the saved list, settings, PINs and ads were not tried on the emulators, and how a real remote, launcher or screen behaves is unverified. Release builds also cannot reach a server over plain HTTP, which a household without a certificate would need: see [Plain HTTP](../apps/android/README.md#plain-http).
