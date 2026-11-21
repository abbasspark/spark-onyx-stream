# Viewer website

The site people watch on: a home page with rows of titles, pages for each movie and series, browsing by category, search, and the player. It is a Next.js application that reads the public catalog API (`/v1/catalog`). It needs no database and no sign-in of its own.

## Pages

| Address                       | What it shows                                                             |
| ----------------------------- | ------------------------------------------------------------------------- |
| `/`                           | One featured title, what the viewer began watching, then rows of titles   |
| `/browse`                     | All titles, filtered by kind and category, in a chosen order              |
| `/title/{slug}`               | One title: artwork, facts, synopsis, episodes of a series, similar titles |
| `/watch/{slug}`               | The player for a movie. With `?trailer=1`, the trailer                    |
| `/watch/{slug}/{episode id}`  | The player for an episode, which goes on to the next one                  |
| `/search`                     | Search by name while typing                                               |
| `/sign-in`, `/sign-up`        | Sign in, and create an account                                            |
| `/account`                    | The viewer's name, password, devices, and deleting the account            |
| `/sitemap.xml`, `/robots.txt` | For search engines                                                        |

## Run it

The API must be running, with at least one published title to see anything. See the [API README](../api/README.md).

```bash
pnpm dev:web
```

The site is then at <http://localhost:3001>. Requests to `/v1` are passed on to the API (`src/proxy.ts`), so the browser talks to one address.

For a production build:

```bash
pnpm --filter @onyx/web build
pnpm --filter @onyx/web start
```

In the Docker installation the website is the `web` service and the gateway serves it at `/`. See [deploy/compose](../../deploy/compose/README.md).

## Settings

They are read when the server starts: from the `.env` file at the repository root, or from the environment in Docker. A change needs a restart, not a new build.

| Name                   | Default                               | Meaning                                                                                |
| ---------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| `WEB_SITE_NAME`        | `Onyx Stream`                         | Name in the header, the browser tab and link previews                                  |
| `WEB_SITE_DESCRIPTION` | `Movies and series, streamed to you.` | One sentence for search engines                                                        |
| `WEB_SITE_URL`         | `http://localhost:3001`               | Public address of the site, for the sitemap and link previews                          |
| `WEB_API_URL`          | `http://localhost:3000`               | Where the server reaches the API                                                       |
| `WEB_MEDIA_ORIGIN`     | empty                                 | Origin of media and artwork when it is not the site itself: the API's `MEDIA_BASE_URL` |

## How it works

- **Pages are built on the server** from the catalog, so they load with their content and search engines can read them. Title pages carry link-preview data and structured data for search engines.
- **Catalog answers are kept for 30 seconds** and shared between all viewers. A change in the admin panel shows up within about a minute.
- **A title that is not published answers 404**, the same as one that never existed.
- **Scripts run only with a nonce** that is new for every page (content security policy). Injected markup cannot run script.
- **Search and playback requests go from the browser straight to the API.** Each viewer then uses their own request allowance, and signed playback addresses are never cached.
- **Who is signed in is asked by the browser**, not built into the page, so pages stay the same for everyone and can be shared. The session is a cookie that the page's scripts cannot read.
- **"Continue watching" lives in the browser.** Positions are stored on the device and do not follow an account yet.

## The player

- HLS through hls.js, or the browser's own player where hls.js does not run (Safari on iPhone).
- Quality, subtitles and speed in one menu. Small preview pictures on the seek bar when the video has them.
- Resumes where the viewer stopped, with a button to start over. After an episode, the next one starts by itself unless the viewer stays.
- Keys: `Space` or `K` play and pause, `←` `→` skip 10 seconds, `↑` `↓` volume, `M` mute, `F` full screen, `C` subtitles.

## Design

The name gives the look: onyx is black stone with pale bands. The page is true black, the text the warm white of the bands, and stacked bands are the one recurring mark (logo, progress, seek bar). The only accent is the amber of sardonyx and it marks what can be played. Colour otherwise comes from the catalog's artwork. One typeface, Archivo, is used narrow and heavy for titles and at normal width for text. The tokens are at the top of `src/app/globals.css`.

## Structure

```
src/
  app/
    (site)/        Pages with header and footer: home, browse, title, search
    watch/         The player pages, which fill the screen
  components/      Header, hero, rows, cards, episode list
    player/        Player, seek bar, settings menu
  lib/             Catalog client, formatting, watch progress, preview-track parser
```

## Not built yet

- Watch history that follows a viewer between devices
- Smaller versions of artwork for small screens. Pictures are sent as uploaded
- Translations of the interface
- A page for the site's own branding in the admin panel. Name and description come from settings
