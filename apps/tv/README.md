# The television app

An Android TV client for a Spark Onyx Stream installation. It runs on Android
TV and Google TV, and on the televisions and sticks that use Amazon's fork of
Android.

It is a client, not a service: it talks to a server an operator runs, over the
same public API the website uses.

## Building it

Android Studio opens `apps/tv` as a project of its own. From a terminal:

```sh
cd apps/tv
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew lintDebug test         # what CI should run
```

Nothing but a JDK 17 or newer and the Android SDK is needed; the wrapper
brings its own Gradle.

### Building your own copy

Everything an operator changes is a Gradle property, in `gradle.properties`
or on the command line:

```sh
./gradlew assembleRelease \
  -Ponyx.serverUrl=https://stream.example.com \
  -Ponyx.appName="Kino Nord" \
  -Ponyx.applicationId=de.kinonord.tv
```

| Property             | What it does                                                             |
| -------------------- | ------------------------------------------------------------------------ |
| `onyx.serverUrl`     | The service the app connects to. Left empty, the app asks on first run.  |
| `onyx.appName`       | What the television's launcher writes under the icon.                    |
| `onyx.applicationId` | The id the app is installed under. Change it before publishing your own. |

The name, the logo colour and the accent come from the server at run time, so
a service that rebrands itself does not need a new build for that.

## How it is put together

```
app/src/main/kotlin/de/sparksystem/onyx/tv/
  OnyxApp.kt          the container everything is built from
  MainActivity.kt     where the app is, and the way back out
  Keys.kt             the keys of a remote control, named
  data/               the API and what this television remembers
  ui/                 one model per part of the app, and the screens
```

There is no dependency-injection framework and no code generation. The app
has three things to hand round — the settings store, the API client and the
player — and an operator who compiles it themselves should be able to follow
where each of them comes from by reading one file.

The API client is written by hand over OkHttp. Every field the server may
leave out has a default, so an app built against one version of the API keeps
working against an older or a newer one. That matters more here than on the
web: a television is updated when its owner gets round to it.

## Signing in

A television has no keyboard worth the name, so the app never asks for an
email address. It asks the server for a short code, shows it with a square
the viewer's phone can read, and watches until the viewer approves it on the
website. The server decides how often the app may ask.

The app tells the server what it is, as `android-tv/1.0.0` in the
`X-Onyx-Client` header. An operator can refuse versions that are too old,
under Settings in the panel, and the app shows the message they set rather
than failing at the next request.

## The remote control

|                                    |                                                                   |
| ---------------------------------- | ----------------------------------------------------------------- |
| Arrows                             | Move about; in the player, left and right skip ten seconds        |
| OK                                 | Choose; in the player, play and pause                             |
| Back                               | Out of the player to the title, out of the title to the home page |
| Play, pause, stop, rewind, forward | What they say                                                     |
| Next                               | Skips the opening or the credits, when one is running             |

## What is here, and what is not

Built: the server address, signing in by code, profiles with their PINs, the
home page with its rows and opening, a title with its seasons and episodes,
and the player — HLS through Media3, resume where you left off, progress
reported back, and the opening and credits skippable.

Not yet: live channels, search, the list a viewer saves, and the settings
screen. Those come next, in that order.

## What has been checked

The app compiles, passes Android Lint with no errors, and its unit tests
pass. It has not been run on a television: that needs a device or an
emulator, neither of which exists in the environment it was written in. Treat
the first install as the first real test.
