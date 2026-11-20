# Phase 2: catalog

The catalog turns videos into things a viewer can find: movies and series with names, texts, artwork and categories. This document describes the part that is built, which is the admin side. The public catalog API and the viewer website follow in the same phase.

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

One case is not blocked: an admin can delete a video in the library while a published title still uses it. The checklist then shows the title as incomplete. The public catalog API, when it is built, must leave such titles out.

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

## Admin panel

- **Titles:** a wall of posters or a table, tabs for movies and series, search, filters for status and category, sorting.
- **Title editor:** details with one save button and a warning before unsaved changes are lost, videos and artwork that save as they are chosen, seasons and episodes for a series, and a publishing card with the checklist.
- **Categories:** create, edit, delete and reorder.
- The dashboard shows the number of titles, and the command palette can start a new title.

## Not built yet

- The public catalog API and the viewer website
- People and credits (cast, directors)
- Collections and rows for the home page
- Importing metadata from outside sources
- Resized artwork, and choosing a poster from a video's own pictures
- Subtitles uploaded as separate files
