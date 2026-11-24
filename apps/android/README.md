# The Android apps

Two apps for a Spark Onyx Stream installation, out of one project:

- **`:tv`** — Android TV and Google TV, and the televisions and sticks that use Amazon's fork of Android.
- **`:mobile`** — phones and tablets.
- **`:core`** — what they share, which is everything behind the screens.

They are clients, not a service: they talk to a server an operator runs, over the same public API the website uses.

## Building them

Android Studio opens `apps/android` as a project. From a terminal:

```sh
cd apps/android
./gradlew :tv:assembleDebug        # tv/build/outputs/apk/debug/
./gradlew :mobile:assembleDebug    # mobile/build/outputs/apk/debug/
./gradlew lintDebug test           # what CI should run, across all three modules
```

Nothing but a JDK 17 or newer and the Android SDK is needed; the wrapper brings its own Gradle.

### Building your own copy

Everything an operator changes is a Gradle property, in `gradle.properties` or on the command line:

```sh
./gradlew assembleRelease \
  -Ponyx.serverUrl=https://stream.example.com \
  -Ponyx.appName="Kino Nord" \
  -Ponyx.applicationId=de.kinonord.tv \
  -Ponyx.mobileApplicationId=de.kinonord
```

| Property                   | What it does                                                         |
| -------------------------- | -------------------------------------------------------------------- |
| `onyx.serverUrl`           | The service both apps connect to. Left empty, they ask on first run. |
| `onyx.appName`             | What the launcher writes under the icon.                             |
| `onyx.applicationId`       | The id the television app installs under.                            |
| `onyx.mobileApplicationId` | The id the phone app installs under.                                 |

The name, the logo colour and the accent come from the server at run time, so a service that rebrands itself does not need a new build for that.

## How it is put together

```
core/     the API, what a device remembers, the view models, the pure decisions
tv/       the television's screens, its theme, and the keys of a remote
mobile/   the phone's screens, its theme, and what a thumb does
```

Everything behind a screen is shared. The API client, the session store and every view model — starting up, the catalog, a title, playing, live, searching, the saved list — live in `core` and are used unchanged by both apps. An app is its screens and little else.

What is not shared is anything that would be a lie in the other place. A television is read from three metres away with four arrows; a phone is read from thirty centimetres with a thumb. So each app has its own theme, its own type scale, its own navigation and its own player chrome, built on the same palette and the same behaviour.

There is no dependency-injection framework and no code generation. An operator who compiles this themselves should be able to follow where everything comes from by reading `core/Container.kt`.

## Signing in

The two apps differ here, because the devices differ.

A **television** has no keyboard worth the name, so it asks the server for a short code, shows it with a square a phone camera can read, and watches until the viewer approves it on the website.

A **phone** has a keyboard, and it is the device somebody would reach for to approve a code anyway, so it asks for an email address and a password directly. One step rather than three.

Both tell the server what they are — `android-tv/1.0.0` or `android/1.0.0` in `X-Onyx-Client` — so an operator can refuse versions that are too old, and the app shows the message they set rather than failing at the next request.

## What is here

|                                              | Television     | Phone          |
| -------------------------------------------- | -------------- | -------------- |
| Server address, profiles and PINs            | yes            | yes            |
| Home, title, episodes, resume                | yes            | yes            |
| Player with HLS, markers, progress           | yes            | yes            |
| Search                                       | drawn keyboard | the system one |
| The saved list, settings                     | yes            | yes            |
| Live: lineup, now and next                   | yes            | yes            |
| Live: tuning by number, channel keys, banner | yes            | —              |
| Live: the guide over the picture             | yes            | —              |
| Live: going back in what a channel keeps     | yes            | yes            |

## What has been checked

Both apps compile, pass Android Lint with no errors, and the shared tests pass. Release builds come to about 2.8 MB each once R8 has shrunk them.

Neither has been run. An emulator needs hardware virtualisation that was not available where these were written, and there was no television or phone to hand. Treat the first install as the first real test: focus order on the television, how Media3 handles a particular stream, how a given launcher treats the banner, and how the phone behaves when it is turned are all unverified.
