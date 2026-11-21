# Phase 2: catalog

The catalog turns videos into things a viewer can find: movies and series with names, texts, artwork and categories. This document describes the admin side and the public catalog API. The viewer website that reads this API is described in [apps/web/README.md](../apps/web/README.md).

## Model

| Thing    | What it is                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------- |
| Title    | A movie or a series. Holds the name, texts, release year, age rating, language and publishing state |
| Season   | A numbered part of a series, with an optional name                                                  |
| Episode  | A numbered part of a season, with its own video, picture and publishing state                       |
| Category | A group viewers browse by, such as a genre. Categories have an order. A title can be in several     |
| Image    | One uploaded picture: poster, backdrop, logo or episode still                                       |

A title does not contain a video. It points at an asset in the library. A movie has a main video and can have a trailer. A series can have a trailer, and each episode has its own video. Deleting a title never deletes a video.

Every title, and every category, has a slug: the readable part of its future web address. Slugs are made from the name, keep letters of any script, and stay unique by getting a number added when needed.

## Publishing

A title is a draft, published or archived. Episodes are a draft or published.

| Rule                                                                          | Reason                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| A movie can be published only with a video that is ready                      | A viewer must never open a title that cannot play    |
| A series can be published only with at least one published episode            | The same                                             |
| An episode can be published only with a video that is ready                   | The same                                             |
| The video of a published movie or episode can be replaced only by a ready one | Replacing must not break playback                    |
| A published title cannot be deleted, and its video cannot be detached         | Taking something away from viewers is a visible step |
| A series goes back to draft when its last published episode is unpublished    | An empty series must not stay visible                |

The API returns a checklist with every title. Required points block publishing. Recommended points (poster, synopsis, category) are shown but do not block. The panel shows the same list, so the API and the panel cannot disagree about what is missing.

A video "can be played" when it is ready and has a stream. A video stored without processing is ready but has no stream, so it does not count.

One case is not blocked: an admin can delete a video in the library, or process it again, while a published title uses it. The title stays published but is hidden from viewers until it can be played again. The panel marks such a title as hidden and explains why.

## Artwork

- Pictures are JPEG, PNG or WebP, up to 10 MB and 8192 pixels per side.
- The kind of file is read from its content, not from its name or the type the browser reports.
- A picture is stored once, as uploaded, in the default storage pool under `artwork/`, and counts toward the pool's usage.
- Pictures are public. They are served at `/v1/artwork/{id}.{ext}` with a long cache time. An address never changes its content: replacing a poster creates a new picture with a new address.
- A picture can be deleted only when nothing uses it.

Resized variants for small screens are not made yet.

## API

All routes are under `/v1` and need the `catalog:read` or `catalog:write` permission, except the artwork route, which is public.

| Method and path                    | Purpose                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `GET /categories`                  | All categories in their order, with the number of titles       |
| `POST /categories`                 | Create a category                                              |
| `PUT /categories/order`            | Set the order of all categories                                |
| `PATCH /categories/{id}`, `DELETE` | Change or delete a category                                    |
| `GET /titles`                      | Page of titles. Filters: type, status, category, search. Sorts |
| `POST /titles`                     | Create a draft movie or series                                 |
| `GET /titles/{id}`                 | A title with seasons, episodes and the publishing checklist    |
| `PATCH /titles/{id}`, `DELETE`     | Change or delete a title                                       |
| `PUT /titles/{id}/status`          | Publish, unpublish or archive                                  |
| `POST /titles/{id}/seasons`        | Add a season                                                   |
| `PATCH /seasons/{id}`, `DELETE`    | Change or delete a season                                      |
| `POST /seasons/{id}/episodes`      | Add an episode                                                 |
| `PATCH /episodes/{id}`, `DELETE`   | Change, publish or delete an episode                           |
| `POST /images?kind=POSTER`         | Upload a picture. The request body is the file itself          |
| `DELETE /images/{id}`              | Delete a picture that nothing uses                             |
| `GET /artwork/{id}.{ext}`          | The picture, public                                            |

Changes to the catalog are written to the audit log.

## Public catalog API

The viewer website and the apps read the catalog through `/v1/catalog`. No sign-in is needed.

| Method and path                                | Purpose                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /catalog/home`                            | Rows for the home page: featured, new, then one row per category                                     |
| `GET /catalog/categories`                      | Categories that have something to show, with the number of titles                                    |
| `GET /catalog/titles`                          | Page of titles. Filters: `type`, `category` (slug), `featured`, `q`. Sorts: `newest`, `name`, `year` |
| `GET /catalog/titles/{slug}`                   | One title, for a series with its seasons and episodes                                                |
| `POST /catalog/titles/{slug}/playback`         | Signed addresses for playing a movie                                                                 |
| `POST /catalog/titles/{slug}/trailer/playback` | The same for the trailer                                                                             |
| `POST /catalog/episodes/{id}/playback`         | The same for an episode                                                                              |

- **Only what can be watched is returned.** Every query uses one filter: the title is published, and a movie's video can be played, or a series has at least one published episode whose video can be played. Seasons and episodes without something to watch are left out, and the counts follow.
- **A draft answers exactly like a title that does not exist.** A request cannot find out which slugs are in use.
- **The shapes are a contract.** They carry no publishing state and no storage or processing details. Fields are added, not renamed or removed.
- **Reads may be cached for 30 seconds** by browsers, the gateway and later the edges. A change in the panel reaches viewers within that time. Playback answers are never cached.
- **Requests are limited per client address:** 600 reads and 120 playback requests a minute. If Redis is unreachable the limit is skipped, so the site stays up.
- **Any website may read it.** The catalog carries no credentials, so cross-origin requests are allowed.

### Who may play

`CATALOG_PLAYBACK` decides:

| Value     | Meaning                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| `open`    | Anyone who can reach the site can play every published title. Default         |
| `viewers` | Only signed-in viewers can play. See [phase-2-viewers.md](phase-2-viewers.md) |
| `off`     | Nobody can play through the catalog                                           |

Browsing the catalog works in every case. With `open`, publishing a title makes it watchable by everyone on the internet who can reach your gateway. Admins can always play videos in the panel.

## Admin panel

- **Titles:** a wall of posters or a table, tabs for movies and series, search, filters for status and category, sorting.
- **Title editor:** details with one save button and a warning before unsaved changes are lost, videos and artwork that save as they are chosen, seasons and episodes for a series, and a publishing card with the checklist.
- **Categories:** create, edit, delete and reorder.
- The dashboard shows the number of titles, and the command palette can start a new title.
- A published title that viewers cannot see is marked as hidden in the list and explained in the editor. The editor links to the title's public data.

## Import of details

Typing the details of a title is the slow part of building a catalog. With `TMDB_API_TOKEN` set, the panel fills them from The Movie Database (TMDB).

- **Search, look, then import.** The admin searches by name (and year), sees what an entry would bring, chooses the parts, and imports. Nothing changes before the last step.
- **A new title or an existing one.** "Import" on the Titles page creates a draft. "Get details from TMDB" in a title's menu fills that title.
- **What comes over:** names, tagline, synopsis, year, age rating of the configured country, original language, genres as categories, poster, backdrop and logo, and for a series its seasons and episodes with name, synopsis and a still. Specials (season 0) only when asked for.
- **Pictures are copied into the catalog's own storage.** The site never loads pictures from TMDB when viewers browse, and keeps working when TMDB does not.
- **An existing title only gains.** By default empty fields are filled and missing seasons and episodes added, so nothing typed by hand is lost. "Replace" overwrites texts and pictures with those of the source. In both cases the address of the title, its videos and what is published stay as they are, and nothing is ever deleted.
- **A placeholder name such as "Episode 3" gives way** to the real name of the episode, also without "Replace".
- **Genres match categories by name,** ignoring capital letters. Missing ones are created unless that is turned off.
- **What cannot be had is skipped and reported:** a picture that is missing or too large, a season the source fails to deliver. The rest is imported.
- **The catalog remembers where a title came from** (`metadata` on the title), marks entries that are in the catalog already, and refuses a second import of the same entry unless a copy is wanted.
- **Only paths of pictures that look like TMDB's are downloaded,** and only from TMDB's picture server, so an answer cannot make the API fetch something else.

| Setting             | Default | Meaning                                                                                    |
| ------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `TMDB_API_TOKEN`    | empty   | The "API Read Access Token" or the "API Key" of a TMDB account. Empty turns the import off |
| `METADATA_LANGUAGE` | `en-US` | Language of the details when the admin does not choose one                                 |
| `METADATA_REGION`   | `US`    | Country whose age ratings are imported                                                     |

| Method and path              | Purpose                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `GET /metadata`              | Whether the import is set up, and its defaults                          |
| `GET /metadata/search`       | Entries at the source by name. `type`, `q`, optional `year`, `language` |
| `GET /metadata/preview`      | What an import of one entry would bring. Changes nothing                |
| `POST /metadata/import`      | Creates a draft title from an entry                                     |
| `POST /titles/{id}/metadata` | Brings an entry's details into an existing title. `overwrite` replaces  |

All need `catalog:write`, except the first, which needs `catalog:read`.

**Terms of the source.** TMDB asks to be named where its material is used. The panel shows its notice in the import dialog, and the viewer website shows it on the page of every imported title (the public catalog API tells clients with `metadataSource`). Apps you build must do the same. TMDB's API is free for sites that earn no money; a site that sells access needs an agreement with TMDB. That is between the operator and TMDB.

## Not built yet

- Playback that needs a purchase or a subscription
- People and credits (cast, directors)
- Collections and rows for the home page
- Other sources than TMDB, and importing many titles at once
- Trailers from the source. A trailer is a video of your own library
- Resized artwork, and choosing a poster from a video's own pictures
- Subtitles uploaded as separate files
