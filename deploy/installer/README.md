# Installer

One command that sets up Spark Onyx Stream on a server, and a command for the days after.

```bash
curl -fsSL https://raw.githubusercontent.com/abbasspark/spark-onyx-stream/main/deploy/installer/install.sh | sudo bash
```

With a domain that points at the server, the site gets HTTPS by itself:

```bash
curl -fsSL https://raw.githubusercontent.com/abbasspark/spark-onyx-stream/main/deploy/installer/install.sh \
  | sudo bash -s -- --domain watch.example.com
```

When it is done, it prints the address of the admin panel. Open it and create the first admin, straight away: whoever opens it first becomes the owner.

## What you need

- A Linux server with a 64-bit Intel, AMD or ARM processor. Debian and Ubuntu are what it is tried on.
- 2 GB of memory for the first build, or swap to make up for it. 4 GB is a comfortable start.
- 10 GB of free disk, plus room for your videos.
- For HTTPS: a domain with an A record that points at the server, and the ports 80 and 443 reachable from the internet.

## What it does

1. **Checks the server:** Linux, processor, memory, free disk. It warns where something is short and asks before going on.
2. **Checks the tools:** installs `git`, `curl` and `openssl` when they are missing. Installs Docker with Docker's own script from get.docker.com when it is missing, after asking.
3. **Fetches the code** into `/opt/onyx-stream`.
4. **Writes the settings** to `deploy/compose/.env`, with fresh secrets, the address of the site and its name. With a domain it also switches on the HTTPS proxy and closes the plain port to the outside.
5. **Builds and starts** everything. The first build takes 5 to 15 minutes.
6. **Waits until the site answers**, installs the `onyx` command and says what to do next.

It is the same installation the [Compose README](../compose/README.md) describes by hand, with nothing hidden: everything is in `/opt/onyx-stream`, and every `docker compose` command works there.

### Running it again

The installer can be run again at any time. It carries on where it stopped: a build that ran out of memory, a server that was restarted. On a server that is installed it changes **no setting and no secret**, builds what is new and starts what is not running.

If the folder was deleted but the data of the installation is still on the server, the installer stops instead of writing new secrets: the database opens only with the password it was made with. Put your copy of the old `.env` back and run it again.

### Options

| Option               | Does                                                      |
| -------------------- | --------------------------------------------------------- |
| `--domain <name>`    | Domain of the site. Switches HTTPS on                     |
| `--site-name <name>` | Name of the site, as viewers see it. Default: Onyx Stream |
| `--port <number>`    | Port of the site when there is no domain. Default: 8080   |
| `--dir <path>`       | Where to install. Default: `/opt/onyx-stream`             |
| `--ref <name>`       | Branch or tag to install. Default: `main`                 |
| `--repo <address>`   | Where to fetch the code from, for forks                   |
| `--yes`              | Ask nothing. What was not given keeps its default         |
| `--no-build`         | Start with images that are on the server already          |
| `--no-docker`        | Do not install Docker. Stop when it is missing            |
| `--no-command`       | Do not install the `onyx` command                         |

Without `--yes` and without `--domain`, the installer asks for the domain and the name of the site. Without a terminal to ask on, it takes the defaults.

To install from a copy of the repository that is on the server already: `sudo deploy/installer/install.sh --dir "$PWD"`.

## The `onyx` command

```
onyx status                 What runs, whether the site answers, the newest backup
onyx logs [service ...]     Follow the logs. Without a service: the API and the worker
onyx start                  Start everything
onyx stop                   Stop everything. Data stays
onyx restart [service ...]  Start again, after a change in .env for example

onyx backup                 Back the database up now, into the backups folder
onyx backups                List the backup files
onyx verify <file>          Prove that a backup opens. Changes nothing
onyx restore <file>         Replace the database with a backup

onyx update                 Move to the newest version. Goes back by itself if it does not come up
onyx update --check         Only say whether there is a newer version
onyx rollback               Go back to the version before the last update

onyx env                    Show where the settings are
onyx compose <...>          Run any "docker compose" command for the installation
onyx version                Which version is installed
```

`onyx restore` does the whole procedure of [restoring a backup](../../docs/phase-6-operations.md#restoring): it proves that the backup opens, asks you to type `restore`, stops what uses the database, puts the database as it is aside, restores, and starts everything again. A backup is named by its file name in the backups folder, or by the path of a file on the server, such as one you downloaded from the panel.

## Updating

```bash
onyx update
```

It says what would change and asks before it starts. Then:

1. **Builds the new version** while the site keeps running on the old one. A version that does not build changes nothing.
2. **Puts the database aside.** The application is stopped first, so the copy holds everything up to the last moment. The site is down from here on.
3. **Switches** to the new version, lets it bring the database up to date, and waits until the API and the website answer.
4. **Goes back by itself** when they do not: to the files, the images and the database from before. Nothing is lost, and what the new version said before it gave up is kept in `.onyx/failed-update.log`.

The site is down for a minute or two, between steps 2 and 3.

`onyx update --check` only says whether there is a newer version, and how much of it touches the database. `onyx update --ref <branch or tag>` moves to a version you name. `--yes` skips the question.

### Going back later

An update can come up and still be wrong. Until the next update, there is a way back:

```bash
onyx rollback
```

It returns the files and the images of the version before. What happens to the database depends on the update:

- **The update did not change the structure of the database:** the database is kept as it is, and nothing is lost.
- **It did:** the older version cannot read the newer database, so the database goes back too, to the moment of the update. Everything that changed since then is lost. `onyx rollback` says which of the two it is and asks before it does anything, so decide soon after an update.

### What an update keeps

In the folder `.onyx` of the installation, readable by root only: the database from before the last update, a copy of the settings, and a note of the versions. The images of the version before stay on the server under the tag `rollback`. All of it is replaced by the next update. Images that no version uses any more pile up over time; `docker image prune` removes them.

Files of the installation that were changed by hand stop an update, because it would overwrite them. `.env` is not one of them: an update only ever adds to it.

## After the installation

- **Copy `deploy/compose/.env` to somewhere other than the server.** It holds `MASTER_KEY`. Backups and encrypted videos cannot be opened without it.
- The database is backed up every night. Where to, and how many are kept, is set in the panel under **Settings → Backups**.
- Live channels pushed by an encoder use the ports 1935 (TCP) and 8890 (UDP). Open them in the firewall of your hosting provider if you use them.
- Everything else, such as email, payments and who may watch, is set in `.env`. After a change: `onyx restart`.
- **Settings → Diagnostics** in the panel says what is wrong with the installation, if anything, and whether a newer version exists. Set up email to be told by email when a problem appears.

## Tests

```bash
pnpm test:installer
```

They cover the logic of the installer and of `onyx`: options, what is accepted as a domain, a port and a site name, how the settings are written, and how an update finds its target, counts database changes and keeps its notes. They change nothing on the machine and need neither root nor Docker.
