# Television app for Samsung and LG

One web app, `apps/tv-web`, runs on both Samsung (Tizen) and LG (webOS) televisions from 2021 on. It is built for a remote control: four arrows, OK, back and the media keys.

## How it is delivered

The app is served by the gateway under `/tv/`, on the same address as the API. The package a viewer installs on the television holds only a small page that opens `https://your-server/tv/`. That has three consequences:

- No cross-origin setup. The app and the API share an origin, so `CORS_ORIGINS` needs nothing.
- Updating the server updates the app. There is nothing to resubmit to a store for a new version.
- The package is made once per operator, with their address in it.

## What it does

- Signs in with a code: the television shows a short code, the viewer enters it on a phone or computer.
- Home screen with "Continue watching" and the rows of the site.
- Title pages, with seasons and episodes for series.
- Playback of HLS through the television's own player, with resume, skip of 10 seconds, pause, the back key, saving of the place every 30 seconds, and the heartbeat that holds the account's place among devices playing at once.

## What it does not do yet

- Search, saved list, profile choice and PIN entry, live channels and the guide, subtitle and audio choice, skipping intros and credits, and ads. The Android TV app has most of these.
- Profiles with a PIN. A viewer whose main profile has a PIN cannot sign in on this app yet.
- None of it has been run on a television. It was run in Chrome at 1920 by 1080 with a keyboard standing in for the remote, against a stand-in server. The remote key codes, the back key on both makers' systems and native HLS on both are taken from their documentation, not from a device.

## Making the packages

```bash
pnpm --filter @onyx/tv-web package -- \
  --server https://tv.example.com \
  --name "My Stream" \
  --id com.example.mystream \
  --icon ./icon.png
```

This writes `apps/tv-web/dist-packages/tizen` and `.../webos`. Without `--server` the television asks for the address the first time it starts and remembers it.

Packing and signing need the makers' tools and your own certificate, which this repository cannot hold:

- **Samsung:** open `dist-packages/tizen` in Tizen Studio (or use the Tizen CLI), sign with a Samsung certificate, and build the `.wgt`. For testing, a television in developer mode takes it directly.
- **LG:** with the webOS CLI, `ares-package dist-packages/webos`, then `ares-install` on a television in developer mode. The store needs an LG Seller Lounge account.

Both stores have their own review. The icon is needed (512 by 512) and is not supplied.

## Which televisions

The build is lowered for Chromium 76, which is Tizen 6.0 (2021 models) and webOS 6 (2021 models) and newer. Older models are not supported: their browsers are too old for the framework, and the app does not carry a second build for them.

## Development

```bash
pnpm --filter @onyx/tv-web dev   # http://localhost:5175, proxies /v1 to the API
```

A desktop browser cannot play HLS by itself, so there the app loads hls.js. Televisions never load it. The keyboard stands in for the remote: arrows, Enter, and Escape or Backspace for back.
