# Phase 6: Operations

Phase 6 is about running an installation over years: keeping its data safe, installing it, updating it and seeing what is wrong with it. It starts with backups, because everything after them leans on them: an update that can be rolled back needs a backup to roll back to.

## Backups

A backup is a copy of the database in one encrypted file. It holds every title, channel, viewer, subscription, payment, admin and setting.

- **Made on a schedule, by the installation itself.** Every night from the first day, without anything to set up. The schedule, how many backups are kept and where they go are set in the panel under **Settings → Backups**.
- **Encrypted before it leaves the process**, under a key made from `MASTER_KEY`. The file can lie in a bucket or on a laptop without giving anything away.
- **Proven to open.** After a backup is written, its file is read back from the storage pool, every part of it is checked against the key, and `pg_restore` reads its table of contents. Only then is it listed as ready.
- **Kept in a storage pool.** That can be the disk of the server or a bucket somewhere else. Only the second kind survives the loss of the server.

### What is not in a backup

| Not included          | Why                                                                            | What to do                                                     |
| --------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Video and image files | They are far larger than the database, and they already live in storage pools  | Copy the storage volume as well, or keep the files in a bucket |
| The `.env` file       | It holds `MASTER_KEY`. A backup that carried its own key would protect nothing | Keep a copy of the file somewhere other than the server        |
| Live segments         | The last hours of a live channel are of no use after a restore                 | Nothing                                                        |

**Without the `MASTER_KEY` a backup was made under, it cannot be opened by anyone, us included.** The same key also opens the storage credentials and content keys inside the database, so a restored database is of little use without it either way.

### How a backup is made

A process with the scheduler role looks for work every twenty seconds: backups an admin asked for, and the scheduled one when its hour has come. One process at a time makes backups, whatever number of them runs.

```
pg_dump ──▶ encrypt ──▶ storage pool          nothing is written to a temporary file
storage pool ──▶ decrypt and check ──▶ pg_restore --list      the proof that it opens
```

- A server that was switched off at the scheduled hour catches up when it is back.
- A scheduled backup that fails is not tried again until the next scheduled hour. The failure stays in the list with its reason, and **Back up now** tries at once.
- A backup that was cut off by a restart is marked as failed, and its half-written file is removed. A file that turns out to be whole is kept and listed, which is the case right after a restore.
- When a backup is ready, finished backups beyond the number to keep are deleted, oldest first. Failed entries go after thirty days.

The tools `pg_dump` and `pg_restore` must be installed where the scheduler runs, in a version no older than the database server. The Docker image has them. Where they are missing or too old, the panel says so, scheduled backups are not tried, and a backup asked for by hand fails with the reason.

### The file

```
"ONYXBKP1"          8 bytes
length of the note  2 bytes
note                JSON, readable without the key: when it was made, by which version, the newest migration
salt                16 bytes
chunks              each: length (4 bytes) | ciphertext | tag (16 bytes)
```

What `pg_dump` writes in its custom format is cut into chunks of 64 KiB. Each chunk is sealed with AES-256-GCM on its own, with its number as the nonce, and the last one is marked as the last. The key of a file is derived with HKDF-SHA256 from `MASTER_KEY`, the salt and the bytes before it. A file that was cut short, had chunks swapped or left out, or whose note was rewritten does not open, and a reader never passes on a byte it has not checked.

Files are named after the moment they were started, in UTC: `backups/2026-11-22T03-00-04Z-1a2b3c4d.onyxbackup`.

### Restoring

Restoring is done on the server, in a terminal: the panel is part of what is being replaced. The panel shows these commands with the name of the chosen file filled in. For an installation run with Docker Compose, from `deploy/compose`:

```bash
# 1. Check that the backup opens. Changes nothing.
docker compose run --rm api node dist/cli/backup.js verify /var/lib/onyx/storage/backups/<file>

# 2. Stop what uses the database.
docker compose stop api worker live

# 3. Restore. The database as it is now is put aside first.
docker compose run --rm api node dist/cli/backup.js restore /var/lib/onyx/storage/backups/<file> \
  --yes --save-current /var/lib/onyx/storage/backups/before-restore.onyxbackup

# 4. Start again. Migrations bring an older backup up to the version you run.
docker compose up -d
```

A file that is not in the storage volume, because it was downloaded or lies in a bucket, is copied there first: `docker compose cp ./<file> api:/var/lib/onyx/storage/backups/<file>`.

What `restore` does, in this order:

1. Opens the whole backup into a temporary file and lets `pg_restore` read its table of contents. A backup that does not open ends here, and the database is untouched.
2. Without `--yes`, says what it would do and stops.
3. Refuses when anything else is connected to the database, unless `--force` is given.
4. With `--save-current`, writes a backup of the database as it is.
5. Empties the database and loads the backup in one transaction.

After a restore, the database is as it was when the backup was made. The list of backups is part of that: the backup that was restored is listed as ready again, and backups made after it are still files in the folder `backups` but are no longer listed. Viewers, payments and titles added since are gone. Videos uploaded since are still in storage, but nothing knows them any more, and titles deleted since are back without their files.

### The command line tool

```
backup create <file>          Write a backup of the database to a file
backup info <file>            Show when a backup was made, and by which version
backup verify <file>          Prove that a backup opens and holds a database
backup restore <file>         Replace the database with a backup
backup decrypt <file> <out>   Write the plain pg_dump archive, for pg_restore
```

It is `node dist/cli/backup.js` in the API image and needs only `DATABASE_URL` and `MASTER_KEY`, not a running application. `create` is what to run before anything risky. `decrypt` is the way out for someone who wants to load a backup with their own tools.

### In the panel

**Settings → Backups** shows, from top to bottom:

- whether the installation is protected: how old the newest backup is and when the next one is due, with a mark for each of the last thirty days
- a warning when no process is making backups, or when the tools are missing
- every backup with its size, how long it took and how many database objects it holds, and for each: download, how to restore it, its checksum, delete
- the schedule: daily, weekly or off, the hour in the admin's own time, how many to keep, and the storage pool

Reading needs the permission `settings:read`. Everything else needs `settings:write`, downloading included. Each of these is written to the audit log.

A download is handed out through a link that works for one minute and for one backup. The browser follows it without the admin's token, so a large file goes straight to disk.

### API

| Method and path                 | Does                                                              |
| ------------------------------- | ----------------------------------------------------------------- |
| `GET /v1/backups`               | Settings, how well the installation is protected, and the backups |
| `POST /v1/backups`              | Asks for a backup now                                             |
| `PUT /v1/backups/settings`      | Saves the schedule                                                |
| `POST /v1/backups/:id/download` | Returns a link to the file that works for a minute                |
| `GET /v1/backups/:id/file`      | The file, for a valid link                                        |
| `DELETE /v1/backups/:id`        | Deletes a backup and its file                                     |

### Limits

- Restoring a backup made by a **newer** version than the one installed is not supported: the application would meet a database it does not know.
- The database is expected in the schema `public`.
- Video files are not backed up by this. See above.
- Nobody is told by email when a backup fails. The panel shows it. Diagnostics, later in this phase, are where alerts will come from.

## The installer

One command sets up a server:

```bash
curl -fsSL https://raw.githubusercontent.com/abbasspark/spark-onyx-stream/main/deploy/installer/install.sh \
  | sudo bash -s -- --domain watch.example.com
```

It checks the server, installs Docker when it is missing, fetches the code into `/opt/onyx-stream`, writes the settings with fresh secrets, builds and starts everything, and waits until the site answers. What it sets up is the Docker Compose installation of `deploy/compose`, the same one that can be made by hand. [deploy/installer/README.md](../deploy/installer/README.md) has the options and the details.

- **It can always be run again.** It carries on where it stopped, and on an installed server it changes no setting and no secret.
- **It never writes new secrets over old data.** When the database of an earlier installation is on the server but its `.env` is gone, it stops and says how to bring the file back.
- **HTTPS is a second Compose file.** `docker-compose.tls.yml` puts a proxy in front of the gateway that gets and renews the certificate for the domain. The plain port is then closed to the outside. Without a domain the site is reached by address and port, which is for trying things out.
- **It brings the `onyx` command:** `onyx status`, `onyx logs`, `onyx backup`, `onyx restore <file>`, `onyx update` and a few more. `onyx restore` is the restore procedure above in one command, with a question before anything is replaced.

The images are built on the server, from the code that was fetched. That needs about 2 GB of memory and 5 to 15 minutes, once.

## Updates with rollback

```bash
onyx update
```

An update must never leave an installation worse off than it was. So the order is: build first, and touch the running site only when there is something to switch to.

```
build the new version          the site runs on the old one; a failed build changes nothing
stop the application           from here the site is down
copy the database              pg_dump by the database server's own tools
start the new version          its migrations run, then the API, then the website
does it answer?  ── yes ──▶    done; "onyx rollback" stays possible until the next update
                 ── no  ──▶    old files, old images, the copied database, start again
```

- **The copy of the database is taken at the last moment,** with the application stopped. Whatever was written while the new version was building is in it, so going back loses nothing.
- **The database goes back only when it has to.** An update that added no migration leaves the database alone on a rollback. One that did takes the database back with it, because the older version does not know the newer structure.
- **"Does it answer" means the API and the website,** through the gateway, the way a viewer reaches them. A migration that fails and an API that does not start both end there.
- **The version before stays on the server:** its images under the tag `rollback`, its commit in a note, the database in `.onyx/`. That is what `onyx rollback` uses, for an update that came up but turned out wrong.
- **The updater that runs is the one of the installed version.** It is read into memory in full before it replaces its own file.

The copy of the database for a rollback is a plain `pg_dump` archive, not one of the encrypted backups. It is made and loaded by the tools inside the database container, which fit the server whatever version of the application is installed, and it lies on the same disk as the database itself, readable by root only.

### The gateway follows the API

Updates brought a fault to light that was there before them. Nginx looks a name up once, when it starts. A container that is made anew, as the API is on every update, can come back with another address, and the gateway went on sending requests to the old one: every page answered with an error until the gateway was restarted. The gateway now asks Docker's name service again every few seconds and follows the API and the website wherever they come back.

## Still to come in this phase

- Diagnostics: one page that says what is wrong with an installation.
