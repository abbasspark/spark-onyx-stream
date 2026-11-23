# Watched locations

A watched location is a folder on the server or an S3-compatible bucket that the platform looks through again and again. A video put there is imported by itself: its title is created from TMDB with details, artwork and cast, the video goes into the library and is processed, and the two are joined. The panel shows all of it under **Imports**.

It needs the import of details to be set up (`TMDB_API_TOKEN`, see [phase-2-catalog.md](phase-2-catalog.md)).

## How files are named

The name of a file starts with the id of the movie or the series at TMDB. The rest of the name is free.

| File                             | Is                                     |
| -------------------------------- | -------------------------------------- |
| `603_the-matrix.mkv`             | The movie 603                          |
| `1399_S01E05_the-pointy-end.mp4` | Season 1, episode 5 of the series 1399 |
| `1399_S00E01_making-of.mkv`      | A special of the series 1399           |
| `603_the-matrix.en.srt`          | Travels with `603_the-matrix.mkv`      |

- **A season and an episode make it an episode.** Movies and series have ids of their own at TMDB, so `603` alone could be either. With `S01E05` after the id it is a series, without it a movie.
- **The id is in the address of the title** at themoviedb.org: `themoviedb.org/movie/603-the-matrix`.
- Dashes, dots and spaces work like the underscore, capitals do not matter, and `tmdb-603_…` is read as well.
- **Videos are** `mp4`, `m4v`, `mkv`, `mov`, `webm`, `avi`, `ts`, `m2ts`, `mpg`, `mpeg`, `wmv` and `flv`. Other files are left alone. Hidden files and folders are skipped, and so is the folder `imported` at the top of a location.
- Folders inside a location are looked through too, and mean nothing: only the name of the file counts.

A file whose name does not start that way is listed as **Not recognised**. An admin says what it is, by searching TMDB by name or by pasting an id or an address, and it is imported like the others.

## What happens to a file

| State               | Meaning                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Waiting             | Seen. Left alone until it has stopped changing                                                |
| Not recognised      | Its name does not say what it is. Waits for an admin                                          |
| Queued              | Known what it is, waiting for its turn                                                        |
| Importing           | Its title is fetched and its video copied into the library                                    |
| Imported            | In the catalog, and its video is being processed or plays                                     |
| Has a video already | The movie or episode has a video. An admin chooses "Replace the video" or sets the file aside |
| Failed              | Something went wrong. The note says what. "Try again" queues it                               |
| Set aside           | Left where it is, by an admin                                                                 |

- **A file in a folder is looked at twice.** It is imported when two looks found it with the same size and date, and it has not changed for `WATCH_SETTLE_SECONDS` (60 by default). That keeps a file that is still being copied from being picked up. A bucket shows a file only when its upload is complete, so there it is taken at first sight.
- **The title is found before it is made.** A title imported from the same TMDB entry is used, whoever imported it. Only when there is none is one imported, as a draft. A series gets all its seasons and episodes, and the file goes to its episode. An episode the series does not have yet is asked for from TMDB again. If TMDB has no such episode, the file fails and says so.
- **A video is never replaced silently.** A second file for a movie or episode that has a video waits for an admin. With "Replace the video", a draft gets the new video at once. A published title keeps the one viewers are watching until the new one plays. The old video stays in the library.
- **The original is not touched before its copy is whole.** The file is copied into a storage pool, its size compared and a checksum taken. Only then is it moved, kept or deleted, as the location says.
- **Nothing is imported twice.** A file kept where it is is recognised by its path, size and date. Another file under the same name is a new delivery, and asks before it replaces.
- **Subtitles and notes of the same name travel with their video** to `imported`, or are deleted with it. They are not imported as subtitle tracks yet.
- A file that disappears before it was imported is forgotten. What was imported stays in the list as history.

## A location

| Setting              | Default                       | Meaning                                                                     |
| -------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Kind                 |                               | A folder on the server, or an S3-compatible bucket with an optional prefix  |
| Looked through       | Every 5 minutes               | From every minute to once a day. "Look now" does not wait                   |
| Videos are stored in | The default pool              | The storage pool imported videos go to                                      |
| Processing           | Decided per video             | As for an upload, or always copy, or always transcode with a chosen profile |
| After import         | Move to the folder `imported` | Or leave the file where it is, or delete it                                 |
| Publish by itself    | Off                           | On, a movie or episode is published as soon as its video plays              |

Before a location is saved, "Look into it" shows whether the place can be read, how many videos it holds and how their names would be understood. It also says when a folder can be read but not written: imports work then, but files stay where they are.

**With Docker**, the folder `watch` beside the Compose file is mounted into the API as `/watch` (`WATCH_PATH` changes which folder). Add `/watch` as a location. The API runs as the user 1000 and moves imported files, so the folder has to be writable for it:

```sh
mkdir -p watch && sudo chown 1000:1000 watch
```

**A bucket** needs a key that may list, read, write and delete under the prefix. Moving a file inside a bucket is a copy followed by a delete, so it takes as long as the file is large.

## API

All under `/v1/watch`. Where a location is, and its keys, need `storage:read` or `storage:write`. What becomes of files needs `catalog:read` or `catalog:write`.

| Method and path                          | Purpose                                                              |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `GET /locations`, `POST /locations`      | The locations with their counts by state; add one                    |
| `POST /locations/test`                   | Look at a place without saving it                                    |
| `GET`, `PATCH`, `DELETE /locations/{id}` | One location. Deleting forgets its list of files, never the files    |
| `POST /locations/{id}/scan`              | Ask for a look now                                                   |
| `GET /files`                             | Files, newest change first. Filters: `locationId`, `state`, `q`      |
| `GET /summary`                           | Counts by state, and how many files wait for an admin                |
| `POST /files/{id}/match`                 | Say what a file is: `kind`, `tmdbId`, and for an episode its numbers |
| `POST /files/{id}/retry`                 | Queue a file again. `replace: true` lets it replace a video          |
| `POST /files/retry`                      | Queue every failed file again, of one location or of all             |
| `POST /files/{id}/ignore`                | Set a file aside                                                     |

## Limits

- One file is imported at a time, and up to ten per look, so a large delivery comes in over several minutes. Processing runs beside it as usual.
- A location is read as a whole with every look. Up to 50,000 videos per location are looked at.
- The file is copied by the API process. A file larger than `UPLOAD_MAX_BYTES` is refused.
- One file is one movie or one episode. Films in several parts, and several episodes in one file, are not understood.
- Only TMDB ids. IMDb ids in names are not read.
