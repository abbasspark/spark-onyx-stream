# Phase 2: catalog

The catalog turns videos into things a viewer can find: movies and series with names, texts, artwork and categories. This document describes the admin side and the public catalog API. The viewer website that reads this API is described in [apps/web/README.md](../apps/web/README.md).

## Model

| Thing      | What it is                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Title      | A movie or a series. Holds the name, texts, facts, age rating, language and publishing state                                   |
| Season     | A numbered part of a series, with an optional name, the day it was first shown and a poster                                    |
| Episode    | A numbered part of a season, with its own video, picture, air date, length and publishing state                                |
| Genre      | What kind of story a title is: drama, thriller. Shared by all titles, one name once                                            |
| Person     | Somebody who plays in titles or makes them, with a portrait and a short biography                                              |
| Credit     | One person's part in one title: cast with the character played, or crew with the job. Credits have an order                    |
| Collection | Titles that belong together in an order: the films of a series of films, or a selection. Has its own poster, and can be hidden |
| Extra      | A further video of a title: a second trailer, a clip, a look behind the scenes. Extras have a kind, a name and an order        |
| Category   | A shelf of the operator's own making that viewers browse by. Categories have an order. A title can be on several               |
| Image      | One uploaded picture: poster, backdrop, logo, episode still or portrait                                                        |

A title does not contain a video. It points at an asset in the library. A movie has a main video and can have a trailer. A series can have a trailer, and each episode has its own video. Deleting a title never deletes a video.

**Facts** are what is known about a title beyond its texts: the release date, the length in minutes, the countries it was made in, its studios or networks, keywords, the IMDb id, and the rating at the source with its number of votes. A series also has a state (upcoming, running, ended, cancelled) and the day it was last shown. The release year stays its own field, so a title can have a year without a full date.

**Genres and categories are two things.** A genre says what a title is and usually comes with an import. A category is a shelf the operator arranges: "Staff picks", "New this week". Before genres existed, imported genres became categories; that is now a choice in the import dialog, off by default in the panel.

**Movies and series have sections of their own in the panel,** `/movies` and `/series`, because they are worked on differently: a movie is one video, a series is a grid of episodes of which some are still missing. The lists differ in their columns and filters (a series shows how many of its episodes have a video, and whether it still runs). The API keeps one resource, `titles`, with `type` as a filter. Old addresses under `/titles` are sent on.

Every title, and every category, genre and person, has a slug: the readable part of its future web address. Slugs are made from the name, keep letters of any script, and stay unique by getting a number added when needed.

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

## Availability

A title can have two dates: shown from, and shown until. Either may be empty.

- **The dates only narrow publishing.** A draft stays a draft whatever its dates say. A published title outside its dates is treated like one that is not published: it is in no list, its page is not found, and nothing of it plays, its episodes and extras included.
- **Nothing runs at the dates.** Every query compares them with the present moment, so a title appears and leaves on time without a scheduled job, and no job can be late or fail.
- **The start counts, the end does not.** A title that ends at midnight is gone at midnight.
- **The panel says which case it is.** A published title before its start is marked "Scheduled", after its end "Ended", and the lists filter by both.

What a viewer bought or rented is not extended by this: a title outside its dates does not play for anyone.

## Extras and collections

**Extras** are videos of the library attached to a title beside its main video and its one trailer. Each has a kind (trailer, teaser, clip, featurette, behind the scenes, interview, bloopers), a name and a place in the order. Viewers get the ones that can be played, and play them without paying, like the trailer. Taking an extra out leaves the video in the library.

**Collections** hold titles in an order. A title can be in several. A collection has a name, a synopsis, a poster and a backdrop, and a switch that hides it from viewers while it is being put together. Without a poster of its own, the panel shows the posters of its first titles. A movie imported from TMDB joins the collection TMDB puts it in ("The Matrix Collection"), which is created on the first import and found again by its id there. Deleting a collection leaves its titles in the catalog.

## Translations

The texts of a title are written in one language, the language of the catalog. A title can have them in more languages.

- **What is translated:** the name, tagline and synopsis of a title, and the name and synopsis of each season and episode. Facts, artwork, the address (slug) and publishing are the same in every language.
- **A translation is optional, field by field.** An empty field is shown in the language of the catalog. A title can have German for its name alone.
- **Languages are tags** such as `de`, `pt-BR` or `zh-Hant`. There is no list to maintain: a language exists when a title uses it, and the panel offers the ones in use first.
- **Viewers ask for a language** with `?language=` on the public catalog. A tag with a country falls back to its language (`de-AT` gets `de`), never to another country, and what is not translated comes in the language of the catalog. A tag that is not one is ignored. The search also matches names in the language asked for.
- **The source helps.** For an imported title, "Fill from TMDB" reads the texts in that language and puts them into the empty fields of the form. Nothing is saved until the admin saves. Where TMDB has no translation it answers in its own language; texts equal to the title's own, and placeholder names such as "Folge 3", are left out.
- **The panel shows the original beside every field,** and how much of a title is translated: of every text the title has in its own language, how many have one in the other.

| Method and path                                   | Purpose                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /titles/{id}/translations`                   | The translations of a title, by language, with how much is filled        |
| `PUT /titles/{id}/translations/{language}`        | Write the whole translation into one language. Empty fields are not kept |
| `DELETE /titles/{id}/translations/{language}`     | Remove a language from a title                                           |
| `GET /titles/{id}/translations/{language}/source` | What TMDB says in that language. Changes nothing                         |
| `GET /translations/languages`                     | The languages in use, with their number of titles                        |

On the public side, `language` is accepted by `GET /catalog/home`, `/catalog/titles`, `/catalog/titles/{slug}`, `/catalog/collections/{slug}` and `/catalog/people/{slug}`. `GET /catalog/languages` says which languages are on offer: the catalog's own, and those at least one visible title is translated into.

### Categories, genres, collections and people

The names viewers see around the titles are translated too: the name and description of a category, the name of a genre, the name and synopsis of a collection, and the name, "known for" and biography of a person.

- **One page in the panel, Catalog > Translations,** for all four. Choose a language; each kind shows how many of its entries have something in it.
- **A sheet, not a form per entry:** every entry with its name in the language of the catalog and a field beside it. Enter goes to the next line. Longer texts open under the entry, with the original next to them.
- **Search looks in both languages; "Only what is missing"** leaves the entries with nothing in the chosen language. The number of titles beside each entry tells the ones that matter from the rest.
- **Everything typed is saved together,** up to 200 entries at once. An entry emptied of all its texts loses its translation.
- **The same rules as for titles:** an empty text shows in the language of the catalog, and `de-AT` gets `de`. A person whose name is written the same everywhere needs none.
- **Viewers read them** in the lists of categories, genres and collections, in the facts and cast of a title, on the pages of people, collections, categories and genres, on every card, and in the heading of a row that is called after a category, genre or collection. A heading typed in the layout builder stays as typed.
- A language can be taken away from a kind as a whole. Translations go with their entry when it is deleted.

| Method and path                                | Purpose                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /translations/terms`                      | The four kinds with their texts and totals, and per language how many are translated   |
| `GET /translations/terms/{kind}`               | A page of entries with their translation into `language`; `q` searches, `missing=true` |
| `PUT /translations/terms/{kind}/{language}`    | `{ items: [{ id, texts }] }`: texts left out stay, empty ones are removed              |
| `DELETE /translations/terms/{kind}/{language}` | Remove the language from every entry of the kind                                       |

`kind` is `categories`, `genres`, `collections` or `people`. On the public side, `language` is now also accepted by `GET /catalog/categories`, `/catalog/genres`, `/catalog/collections` and the pages of categories and genres.

## Duplicating a title

"Duplicate", in the menu of a title on the list and on its page, makes a copy: for a director's cut, a dubbed version kept as a title of its own, a remake, or a series that continues under a new name.

- **The copy is always a draft,** not featured, with a name of its own ("… (copy)" unless another is typed) and an address made from it. Its episodes are drafts too. Nothing changes on the original.
- **The texts and facts always come along.** Everything else is a choice, shown with what the title has of it: artwork; genres, categories and keywords; cast and crew; translations; access and prices with the packages; videos; a place at the end of its collections; the availability dates; the link to TMDB.
- **For a series,** the seasons and episodes come without their videos, with them, or not at all.
- **Three ready-made choices:** "Starting point" (what describes the title, without videos), "Exact copy" (all of it) and "Texts only".
- **Videos and pictures are shared, never copied as files.** A copy costs no storage and no encoding. A picture two titles share cannot be deleted while either uses it, and changing the video or the poster of one title does not touch the other.
- **What viewers did stays with the original:** plays, progress, purchases, lists. So does its place on the arranged pages.

`POST /titles/{id}/duplicate` takes `{ name?, parts? }` and answers with the new title and how many of each thing it got. `parts` holds `artwork`, `classification`, `credits`, `translations`, `pricing` (on unless said otherwise), `videos`, `collections`, `availability`, `metadataLink` (off unless asked for) and `seasons`: `structure` (the default), `full` or `none`.

## The history of a title

Every title keeps a history: after each change, what the title looks like and what differs from before. It is the **History** tab on the page of a title.

- **What is followed:** the texts and facts, publishing (status, address, featured, dates), access and prices, artwork, genres, categories and keywords, cast and crew, videos and extras, translations, and the seasons and episodes of a series. Not followed: the rating from the metadata source and what viewers do.
- **Each entry says who, when and what.** Short values show as before and after, longer texts word by word with what was taken out and put in, lists as what joined and what left. The list can be narrowed to one kind of change.
- **Every way of changing a title is recorded:** its page, the lists with many titles at once, an import or update from TMDB, translating in the background, duplicating. A save that changes nothing leaves no entry.
- **Bring back** restores an earlier version, after showing what that would change now. It brings back texts, facts, access and prices, artwork, genres, categories and keywords, cast and crew, and translations. It leaves alone whether the title is published, its address, its videos and its seasons and episodes: bringing those back could take a title off the site or point it at a video that is gone.
- **What no longer exists is left out and named:** a genre, a person or a picture of that version that was deleted since.
- **Bringing a version back is itself an entry,** so it can be undone the same way.
- The newest 100 entries of a title are kept. The history goes with the title when it is deleted; the audit log keeps the fact that it existed.
- Titles from before this was built get a first entry, "recorded as it was", when the API starts after the update.

| Method and path                                  | Purpose                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `GET /titles/{id}/history`                       | The entries, the newest first. `group` narrows to one kind of change |
| `GET /titles/{id}/history/{revisionId}`          | One entry, with what bringing it back would change now               |
| `POST /titles/{id}/history/{revisionId}/restore` | Bring it back. Answers how much, and what could not be               |

## Many titles at once

On the lists of movies and series, titles can be selected and changed together.

- **Which titles:** the ones ticked, on this page and on others (up to 500), or **everything the filters match**, which also means what is on pages nobody opened. One action changes 5,000 titles at most.
- **What can be done:** publish, unpublish, archive, delete, feature or stop featuring; add to or take out of categories, genres and collections; set, change or remove the start and the end of the availability; and translate into a language.
- **The rules of one title hold for many.** Each title goes through the same checks as a change made in its editor: a title with open points on its checklist is not published, a published title is not deleted. A title that cannot be changed is named with its reason, the others go on, and in the panel the ones that failed stay selected.
- **Adding and taking out touches only what was ticked.** A title that is put into a genre keeps its other genres. In a collection it goes to the end and keeps its place in the others.
- **Each date can be left alone.** The start of many titles can be set without touching their ends. A title whose own other date does not fit is left as it is and named.
- **The log gets one line per action,** with what was done, to how many, and how the titles were chosen.

### Translating many titles

"Translate" fills in a language for every selected title that was imported from TMDB: the name, tagline and synopsis, and those of its seasons and episodes. It asks TMDB once per title, and once more per season of a series, so it does not happen in the request: a **job** is queued and worked off in the background, fifteen titles per look, and the panel shows how far it is.

- **Empty texts are filled, nothing is replaced,** unless the job is told to replace. What an editor wrote stays.
- **A title that was not imported is passed over,** and counted as such. A title TMDB does not know, or that fails for a reason of its own, is named with the reason and the job goes on.
- **When TMDB does not answer,** the job waits and tries the same title again at the next look. After five looks without an answer it stops, keeps what it did, and says why.
- **A job can be stopped.** Titles it finished keep their texts. After a restart of the server a job goes on from where it was.
- Jobs run one after the other, the oldest first, in one API process at a time.

| Method and path                      | Purpose                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `POST /titles/bulk`                  | One action on titles named by `ids`, or on all that a `filter` matches. Answers with counts and failures |
| `GET /translation-jobs`              | The newest jobs with their progress. `?active=true` keeps those waiting or running                       |
| `POST /translation-jobs/{id}/cancel` | Stop a job                                                                                               |

```json
{
  "filter": { "type": "MOVIE", "status": "PUBLISHED" },
  "action": { "type": "translate", "language": "de" }
}
```

The filter takes what `GET /titles` takes, without the page and the order. Actions are `publish`, `unpublish`, `archive`, `delete`, `feature` (`value`), `categories`, `genres` and `collections` (`add`, `remove`), `availability` (`availableFrom`, `availableUntil`; left out: unchanged, `null`: removed) and `translate` (`language`, `overwrite`).

## The home page, and the pages for movies and series

Three pages of the website are arranged in the panel, in the group **Layout**: the **home page**, and the pages that "Movies" and "Series" in the menu lead to. All three are built the same way, from the same kinds of sections.

- **A page without sections is what it is by itself.** The home page puts itself together: an opening with a featured title, the viewer's own row of started videos, the featured titles, the newest, and a row for each category in the order of the categories. "Movies" and "Series" are the list of all movies or series, with its filters. This is what every installation starts with, and it needs no care.
- **"Arrange the page myself" takes a page over.** For the home page, sections are made that show exactly what the automatic page shows at that moment. For "Movies" and "Series", a first page is made: an opening, the featured, the newest, the best rated, and a row per category that has such titles. From then on the page is what its sections say. Going back deletes them. Each page is taken over, and given back, by itself.
- **A page is an opening and rows.** There is one opening at most, and it stands first. Rows follow in the order they are given, which is changed by dragging or with arrows.
- **A row shows titles from a source:** the whole catalog, the featured titles, a category, a genre, a collection, or titles picked one by one. It can be narrowed to movies or series, ordered (newest, latest premiere, best rated, by name, or the own order of a collection or of the picks), and limited to between 4 and 40 titles.
- **On the page for movies a new row is about movies,** and on the page for series about series, unless it is told otherwise. Its heading then does not repeat the word: "New", not "New movies".
- **A row has a look:** upright posters, wide cards with the backdrop, or a numbered top list.
- **The opening shows one title large, or up to 8 that take turns** every few seconds. Its titles come from a source like those of a row. Titles with a backdrop are preferred; without any, the others are taken rather than leaving the page without an opening. The turn waits while the pointer or the keyboard is on the opening, and does not run for visitors who asked their system for less motion.
- **"Continue watching" is a section too:** the place where a viewer finds what they started. Without it, a page does not show that row.
- **So is "My list":** the place where a viewer finds what they saved to watch later. See [My list](phase-2-viewers.md#my-list). A page has one place for each at most. In the answer for clients these rows have the kind `continue` and `list` and carry no titles: the client fills them for the viewer.
- **A section can be switched off, and can have dates.** With a start and an end, a row for a season appears and leaves by itself.
- **A heading is optional.** Without one, a section is named after what it shows: "New movies", "Top rated", the name of the category or collection.
- **Nothing a viewer may not see gets on a page.** Every section goes through the filter of the public catalog, so a draft that was picked by hand is left out, and the panel marks it. A section with nothing to show is not sent, and appears by itself once it has something.
- **"See all" leads where the row came from:** the browse page with the same filters and order, or the page of the collection. Picked titles have none.
- **The full list stays within reach:** an arranged page for movies or series ends with a link to all of them.
- A category, genre or collection that is deleted takes the sections that show it along.

### The live page, and the pages of categories and genres

Three more pages are arranged with the same builder.

- **The live page keeps its channels on top.** Its sections are rows of movies and series that stand under the channels: something to watch when nothing on air appeals. It has no opening, because the channels are its opening. Without sections it ends with its channels, as before.
- **"Category pages" and "Genre pages" are arranged once, for all of them.** Every category then has a page of its own at `/category/{slug}`, every genre at `/genre/{slug}`, with the name and the description on top. Each section holds only titles of the category or genre a visitor opened: "New" is the newest of that category, the opening shows titles of that category.
- **The panel shows the sections with one of yours,** and lets you choose which, so you can see how the arrangement looks for a small category and for a large one.
- **A row for another category makes no sense on the page of a category,** so the builder does not offer it there. A row for a genre does: on the page of "Drama" it shows the dramas of that genre.
- **While these pages are not arranged, a category or genre is the list of its titles,** with its filters, as before. The addresses `/category/{slug}` and `/genre/{slug}` then lead on to that list. An arranged page ends with a link to it.
- **A category or genre without a published title has no page.**
- "See all" of a row leads to the list, narrowed to the category or genre of the page.

`{page}` is `home`, `movies`, `series`, `live`, `category` or `genre`. For `category` and `genre`, `GET /layout/{page}` takes `example`, the id of the category or genre to show the sections with, and answers with the one it used.

| Method and path                         | Purpose                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `GET /layout`                           | The pages, each with whether it is arranged and how many sections it has |
| `GET /layout/{page}`                    | The sections of a page, each with the titles viewers get right now       |
| `POST /layout/{page}/start`             | Take the page over, with sections made for it                            |
| `DELETE /layout/{page}`                 | Delete every section of the page                                         |
| `POST /layout/{page}/sections`          | Add a section: `kind` is `HERO`, `CONTINUE_WATCHING` or `TITLES`         |
| `PUT /layout/{page}/sections/order`     | Set the order of all sections of the page                                |
| `PATCH /layout/sections/{id}`, `DELETE` | Change or remove a section. `titleIds` replaces the picked titles        |

For viewers, `GET /catalog/pages/{page}` (`home`, `movies`, `series` or `live`) answers with `custom`, `hero` (`{ titles }` or null) and `rows`. `GET /catalog/home` is the same as `/catalog/pages/home`. For `movies` and `series`, `custom` is false and there are no rows while the page was not arranged: a client then shows its list. Each row has a `key`, a `name`, a `kind` (`titles`, or `continue` for the place of the viewer's own row, which carries no titles), a `layout` (`poster`, `landscape`, `numbered`), `browse` (the path "See all" leads to on the website, or null) and its `titles`. `GET /catalog/pages/category/{slug}` and `GET /catalog/pages/genre/{slug}` answer the same, with a `subject` (`slug`, `name`, `description`) beside it, and with 404 for one that does not exist or has nothing published.

On the website, the pages are `/movies` and `/series`. Until they are arranged they lead on to `/browse?type=MOVIE` and `/browse?type=SERIES`.

## Artwork

- Pictures are JPEG, PNG or WebP, up to 10 MB and 8192 pixels per side.
- The kind of file is read from its content, not from its name or the type the browser reports.
- A picture is stored once, as uploaded, in the default storage pool under `artwork/`, and counts toward the pool's usage.
- Pictures are public. They are served at `/v1/artwork/{id}.{ext}` with a long cache time. An address never changes its content: replacing a poster creates a new picture with a new address.
- A picture can be deleted only when nothing uses it.

Resized variants for small screens are not made yet.

## API

All routes are under `/v1` and need the `catalog:read` or `catalog:write` permission, except the artwork route, which is public.

| Method and path                     | Purpose                                                                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /categories`                   | All categories in their order, with the number of titles                                                                                                                                                                       |
| `POST /categories`                  | Create a category                                                                                                                                                                                                              |
| `PUT /categories/order`             | Set the order of all categories                                                                                                                                                                                                |
| `PATCH /categories/{id}`, `DELETE`  | Change or delete a category                                                                                                                                                                                                    |
| `GET /titles`                       | Page of titles. Filters: type, status, category, genre, person, series state, with or without video, collection, availability (`scheduled`, `current`, `ended`), search. Sorts by name, dates, release date, rating and length |
| `POST /titles`                      | Create a draft movie or series                                                                                                                                                                                                 |
| `GET /titles/{id}`                  | A title with seasons, episodes and the publishing checklist                                                                                                                                                                    |
| `PATCH /titles/{id}`, `DELETE`      | Change or delete a title                                                                                                                                                                                                       |
| `PUT /titles/{id}/status`           | Publish, unpublish or archive                                                                                                                                                                                                  |
| `POST /titles/{id}/seasons`         | Add a season                                                                                                                                                                                                                   |
| `PATCH /seasons/{id}`, `DELETE`     | Change or delete a season                                                                                                                                                                                                      |
| `POST /seasons/{id}/episodes`       | Add an episode                                                                                                                                                                                                                 |
| `PATCH /episodes/{id}`, `DELETE`    | Change, publish or delete an episode                                                                                                                                                                                           |
| `PUT /titles/{id}/credits`          | Replace the cast and crew of a title with the list sent, in its order                                                                                                                                                          |
| `POST /titles/{id}/extras`          | Add a video of the library to the extras of a title                                                                                                                                                                            |
| `PUT /titles/{id}/extras/order`     | Set the order of the extras                                                                                                                                                                                                    |
| `PATCH /extras/{id}`, `DELETE`      | Change the kind or name of an extra, or take it out                                                                                                                                                                            |
| `GET /collections`, `POST`          | All collections in their order; create one                                                                                                                                                                                     |
| `PUT /collections/order`            | Set the order of all collections                                                                                                                                                                                               |
| `GET /collections/{id}`             | A collection with its titles                                                                                                                                                                                                   |
| `PATCH /collections/{id}`, `DELETE` | Change or delete a collection                                                                                                                                                                                                  |
| `PUT /collections/{id}/titles`      | Set the titles of a collection and their order                                                                                                                                                                                 |
| `GET /genres`, `POST /genres`       | All genres with the number of titles; create one                                                                                                                                                                               |
| `PATCH /genres/{id}`, `DELETE`      | Rename or delete a genre. Titles lose the genre and stay                                                                                                                                                                       |
| `GET /people`, `POST /people`       | Page of people, searched by name; create one                                                                                                                                                                                   |
| `GET /people/{id}`                  | A person with the titles they are in                                                                                                                                                                                           |
| `PATCH /people/{id}`, `DELETE`      | Change or delete a person. Their credits go with them                                                                                                                                                                          |
| `POST /images?kind=POSTER`          | Upload a picture. The request body is the file itself                                                                                                                                                                          |
| `DELETE /images/{id}`               | Delete a picture that nothing uses                                                                                                                                                                                             |
| `GET /artwork/{id}.{ext}`           | The picture, public                                                                                                                                                                                                            |

Changes to the catalog are written to the audit log.

## Public catalog API

The viewer website and the apps read the catalog through `/v1/catalog`. No sign-in is needed.

| Method and path                                    | Purpose                                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /catalog/home`                                | The home page: its opening and its rows, as arranged in the panel, or put together by itself. See [The home page](#the-home-page)                    |
| `GET /catalog/pages/{page}`                        | The same for `home`, `movies`, `series` or `live`                                                                                                    |
| `GET /catalog/pages/category/{slug}`, `genre/…`    | The arranged page of one category or genre, with its name and description                                                                            |
| `GET /catalog/categories`                          | Categories that have something to show, with the number of titles                                                                                    |
| `GET /catalog/titles`                              | Page of titles. Filters: `type`, `category`, `genre`, `person`, `collection` (all slugs), `featured`, `q`. Sorts: `newest`, `name`, `year`, `rating` |
| `GET /catalog/titles/{slug}`                       | One title, for a series with its seasons and episodes                                                                                                |
| `POST /catalog/titles/{slug}/playback`             | Signed addresses for playing a movie                                                                                                                 |
| `POST /catalog/titles/{slug}/trailer/playback`     | The same for the trailer                                                                                                                             |
| `POST /catalog/titles/{slug}/extras/{id}/playback` | The same for one of the extras                                                                                                                       |
| `GET /catalog/collections`                         | Collections that are shown and hold at least one visible title                                                                                       |
| `GET /catalog/collections/{slug}`                  | A collection with its visible titles, in its order                                                                                                   |
| `GET /catalog/genres`                              | Genres that have something to watch, with the number of titles                                                                                       |
| `GET /catalog/people/{slug}`                       | A person with the visible titles they have a part in. 404 for somebody with nothing to watch                                                         |
| `GET /catalog/languages`                           | The languages titles can be read in                                                                                                                  |
| `POST /catalog/episodes/{id}/playback`             | The same for an episode                                                                                                                              |

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
- **Selection:** tick boxes on posters and rows, a range with Shift, the whole page, or everything that matches the filters. A bar at the bottom of the screen holds the actions, and a card above the list shows translations in progress.
- **Title editor:** details with one save button and a warning before unsaved changes are lost, videos and artwork that save as they are chosen, seasons and episodes for a series, and a publishing card with the checklist.
- **Categories:** create, edit, delete and reorder.
- **Layout:** the home page, and the pages for movies and series, each with its sections as cards that show what each one holds right now, with a switch, the order by dragging, and an editor at the side.
- The dashboard shows the number of titles, and the command palette can start a new title.
- A published title that viewers cannot see is marked as hidden in the list and explained in the editor. The editor links to the title's public data.

## Import of details

Typing the details of a title is the slow part of building a catalog. With `TMDB_API_TOKEN` set, the panel fills them from The Movie Database (TMDB).

- **Search, look, then import.** The admin searches by name (and year), sees what an entry would bring, chooses the parts, and imports. Nothing changes before the last step.
- **A new title or an existing one.** "Import" on the Movies or Series page creates a draft. "Get details from TMDB" in a title's menu fills that title.
- **What comes over:** names, tagline, synopsis, year, age rating of the configured country, original language, the facts (release date, length, countries, studios, keywords, IMDb id, rating), genres, the first twenty of the cast and the crew people look titles up by (directors, writers, creators, producers, music, camera), a portrait of each person who has none, poster, backdrop and logo, and for a series its state, its seasons with air date and poster, and its episodes with name, synopsis, air date, length and a still. Specials (season 0) only when asked for.
- **People are found again.** A person imported once is the same person in the next title, recognised by the id of the source, so one actor is one entry with all their titles.
- **The rating follows the source.** Rating, votes, the state of a series and its last air date are refreshed by every import, because nobody types them. Everything else is only filled where it is empty.
- **Pictures are copied into the catalog's own storage.** The site never loads pictures from TMDB when viewers browse, and keeps working when TMDB does not.
- **An existing title only gains.** By default empty fields are filled and missing seasons and episodes added, so nothing typed by hand is lost. "Replace" overwrites texts and pictures with those of the source. In both cases the address of the title, its videos and what is published stay as they are, and nothing is ever deleted.
- **A placeholder name such as "Episode 3" gives way** to the real name of the episode, also without "Replace".
- **Genres are matched by name,** ignoring capital letters, and created when missing. "Also as categories" puts the title on the shelves named like its genres as well.
- **A cast list that was edited is kept.** Credits are written only when the title has none, or with "Replace".
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

- Renting or buying a single title. Subscriptions are in `phase-3-billing.md`
- Translated names of categories, genres and collections, and the website's own words in other languages
- Translated names in what a viewer is watching (the "continue watching" row)
- Extras from the source: an import brings no trailers
- Collections and rows for the home page
- Other sources than TMDB. Many titles at once come in through [watched locations](watched-locations.md)
- Trailers from the source. A trailer is a video of your own library
- Resized artwork, and choosing a poster from a video's own pictures
- Subtitles uploaded as separate files
