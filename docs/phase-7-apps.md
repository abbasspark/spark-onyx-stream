# Phase 7: the apps

A platform people install on their own server needs clients they can give to
their viewers. The first is for the television, because that is where a VOD
service is actually watched; the phone follows.

The app lives in `apps/tv`, with a README of its own for building it. This
document is about the decisions behind it.

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

## Signing in without a keyboard

A television remote has four arrows. Spelling an email address with it is the
worst minute in any television app, so the app never asks.

The platform already had the answer: `POST /v1/viewer/device-codes` gives the
app a short code to show and a secret to ask with, and the viewer enters the
code on the website on the phone already in their hand. The app shows the code
as large as the screen allows, and a square beside it that a phone camera can
read, so that the usual path is: point phone, tap, done.

The server decides how often the app may ask whether the viewer has answered,
and the app obeys it: a room full of televisions must not be able to push a
small server over by asking faster. A code that runs out is replaced without
being asked, because the viewer is standing there with a phone in their hand.

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

Built: the address, signing in by code, profiles with their PINs, the home
page with its opening and rows, "Continue watching", a title with its seasons
and episodes, and the player — HLS through Media3, resume, progress reported
back every half minute, and the opening and credits skippable.

Not built: live channels, search, the list a viewer saves, and a settings
screen. The phone app has not been started.

## What has been checked

The app compiles, passes Android Lint with no errors, and its unit tests
pass. It has not been run: an emulator needs hardware virtualisation, which
the environment it was written in does not have, and there is no television
here. Everything about how it behaves on a real device — focus order, how
Media3 handles a particular stream, how a given launcher treats the banner —
is unverified, and the first install should be treated as the first real
test.
