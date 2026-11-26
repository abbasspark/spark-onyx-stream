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

## Trying the apps on an emulator

Both apps run on the Android emulator, which is how they were first run. You need Android Studio's SDK, a phone image for `:mobile` and a TV image for `:tv`, and a server on your machine.

```sh
# Debug builds may talk plain HTTP (see "Plain HTTP" below). 10.0.2.2 is the emulator's name for your machine.
./gradlew :mobile:assembleDebug :tv:assembleDebug -Ponyx.serverUrl=http://10.0.2.2:3000

adb install -r mobile/build/outputs/apk/debug/mobile-debug.apk   # on a phone emulator
adb install -r tv/build/outputs/apk/debug/tv-debug.apk           # on a TV emulator
```

- **The phone** signs in with an email and password. Typing into the emulator with `adb shell input text` works, but the keyboard moves the fields, so move between them with Tab (`adb shell input keyevent 61`) instead of tapping.
- **The television** shows a code. Approve it as a signed-in viewer: `POST /v1/viewer/device-codes/<code>/approve`, or open `/activate` on the website. Move around with the D-pad (`adb shell input keyevent 19 20 21 22 66`).
- **Content:** publish a movie with a short video in the panel, or through the API as the end-to-end tests do, or there is nothing to play.
- **Screen density:** an emulator made with 320 dpi shows a television twice as large as a real one (a 1080p set reports about 213 dpi, which is 1280dp wide), and the screens look broken. Use `adb shell wm density 213` on a TV emulator.
- **Tests that need a device:** `./gradlew :core:connectedDebugAndroidTest` runs the tests of the session store on whatever emulator or device is connected.

### Plain HTTP

Android blocks plain `http://` addresses by default. The debug builds carry a network configuration (in `src/debug`) that allows them, so they can reach a server on your machine. **Release builds do not**, so they connect only to `https://` addresses. A household that runs its own server without a certificate, at an address such as `http://192.168.1.40:3000`, cannot use a release build yet. The installer sets up HTTPS when it is given a domain, and a server without one answers on plain HTTP.

## What has been checked

Both apps compile, pass Android Lint, and their unit tests pass. CI builds them and runs those on every pull request.

They have been run on emulators, not on a real television or phone:

- **Phone** (Android 14): signing in, the home page, a title page, and playing a video from a local server.
- **Television** (Android 13 TV): the sign-in code, approving it, the home page, a title page and playing a video, using only the D-pad.

Running them found three faults that made both apps unusable, which no test or build could have shown, and each now has a test:

1. **Neither app could sign in.** The server needs an installation id and one of its known device kinds, and the apps sent neither (`DeviceTest`).
2. **A viewer was signed out by their own sign-in.** The session was read from a copy that was only filled at start-up, so the first request after signing in carried no token. The server answered 401, and the app wiped the token it had just been given (`SessionStoreTest`, on a device).
3. **Nothing could be played, and no picture would load.** The server gives addresses as paths, such as `/v1/media/…`, which a browser reads against its site. The player read them as files on the phone (`UrlsTest`).

Not checked: live channels, search, the saved list, settings, profiles with a PIN, ads, a real television's remote and launcher, a real phone being turned, and a physical device of any kind. Focus is not set when a TV screen opens, so the first press of the D-pad only shows where the focus is; an app on a real television should be judged on that by hand.
