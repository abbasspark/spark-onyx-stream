# Single-server installation with Docker Compose

Runs the whole platform on one server: PostgreSQL, Redis, the API, a worker, the viewer website and an Nginx gateway with the admin panel.

```
            ┌──────────── gateway (Nginx, port 8080) ────────────┐
browser ───▶│  /            viewer website                        │──▶ web ──▶ api
            │  /admin/      admin panel                           │
player  ───▶│  /v1/media/…  media files, token checked by Nginx   │──▶ storage volume (read-only)
            │  /v1/…        passed on to the API                  │──▶ api ──▶ postgres, redis
            └─────────────────────────────────────────────────────┘                ▲
                                                             worker (FFmpeg) ──────┘
```

## Requirements

- Docker Engine 24 or newer with the Compose plugin
- About 2 GB of free memory for the first build
- `openssl`, for creating the secrets

## Install

On a server, the [installer](../installer/README.md) does everything below in one command, with HTTPS when you give it a domain:

```bash
curl -fsSL https://raw.githubusercontent.com/abbasspark/spark-onyx-stream/main/deploy/installer/install.sh | sudo bash
```

By hand, or on your own computer:

```bash
cd deploy/compose
./init-env.sh                 # once: writes .env with fresh secrets
docker compose up -d --build  # builds the images and starts everything
```

Open `http://<server>:8080/admin` and create the first admin. The site for viewers is at `http://<server>:8080`. It stays empty until you publish a title.

Before you publish anything, set `SITE_NAME` and `SITE_URL` in `.env`. Read the note on `CATALOG_PLAYBACK` there too: with the default, everyone who can reach the server can watch what you publish.

**Keep a copy of `.env` in a safe place.** Without `MASTER_KEY`, encrypted videos cannot be played and stored S3 credentials cannot be read.

## What runs

| Service    | Image                 | Job                                                       |
| ---------- | --------------------- | --------------------------------------------------------- |
| `gateway`  | `onyx-stream/gateway` | Nginx: admin panel, media files, passes the rest on       |
| `web`      | `onyx-stream/web`     | Viewer website (Next.js)                                  |
| `api`      | `onyx-stream/api`     | REST API and uploads (`APP_ROLE=api,scheduler`)           |
| `worker`   | `onyx-stream/api`     | Processing with FFmpeg (`APP_ROLE=worker`)                |
| `migrate`  | `onyx-stream/api`     | Brings the database to the current version, then ends     |
| `postgres` | `postgres:17-alpine`  | Database                                                  |
| `redis`    | `redis:7-alpine`      | Job queue                                                 |
| `tracker`  | `onyx-stream/tracker` | Lets the players of viewers find each other, for P2P      |
| `tls`      | `caddy:2-alpine`      | HTTPS for your domain. Only with `docker-compose.tls.yml` |

Only the gateway is reachable from outside, and the ingest server on the two ports encoders push live channels to: 1935 (TCP, RTMP) and 8890 (UDP, SRT). Open those in the firewall if you use pushed channels. The API, the website, the database and Redis have no published ports.

### Coming from an earlier version

The admin panel moved from `/` to `/admin`, because the root now belongs to the viewer website. Bookmarks of the panel need `/admin` in front. Signed-in admins stay signed in.

Newer versions bring secrets an older `.env` does not have. Run `./init-env.sh` again after an update: it adds the ones that are missing and leaves everything else in the file as it is.

## How media is served

The gateway checks the playback token of every media request itself, with a small script (`deploy/nginx/njs/media.js`) that uses the same secret as the API. Files of the local storage pool are then sent straight from disk. Anything it does not find there, such as an asset in an S3 pool, and the content keys of encrypted assets are passed on to the API.

The gateway does not ask the database. When an asset is deleted, a cleanup job removes its files, usually within seconds, and from then on the gateway answers its playback URLs with 404.

## HTTPS

The gateway speaks plain HTTP. Do not put the installation on the public internet without HTTPS: sign-in passwords and session tokens would travel unprotected.

### With the proxy that comes with it

`docker-compose.tls.yml` adds a proxy (Caddy) in front of the gateway. It gets a certificate for your domain from Let's Encrypt and renews it by itself. The installer sets this up when it is given `--domain`. By hand:

1. Point the domain at the server with an A record, and make sure the ports 80 and 443 are reachable.
2. Set in `.env`:

   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.tls.yml
   ONYX_DOMAIN=watch.example.com
   SITE_URL=https://watch.example.com
   P2P_TRACKER_URL=wss://watch.example.com/tracker
   HTTP_BIND=127.0.0.1
   ```

3. Run `docker compose up -d`.

   The proxy counts itself, so `TRUST_PROXY_HOPS` is 2 while it is in use and
   needs no line of its own. Set it only for a proxy of your own in front.

`COMPOSE_FILE` makes every `docker compose` command in this folder include the proxy. `HTTP_BIND=127.0.0.1` closes port 8080 to the outside, so the proxy is the only way in.

### With a proxy of your own

Traefik, the load balancer of your hosting provider, or any other TLS proxy works as well:

- send its traffic to port 8080 of this server
- make it set `X-Forwarded-Proto` and `X-Forwarded-For`
- set `TRUST_PROXY_HOPS` in `.env` to how many proxies stand in front of the API, counting the gateway: 2 for one proxy of your own, 3 if that one sits behind another. The address of the viewer is read from this, and the audit log, the sign-in limit and every rate limit go by it
- set `SITE_URL` and `P2P_TRACKER_URL` to the public address, with `https://` and `wss://`

## Everyday tasks

An installation made by the installer has the `onyx` command for these: `onyx status`, `onyx logs`, `onyx backup`, `onyx restore`. See [the installer](../installer/README.md#the-onyx-command).

```bash
docker compose ps                         # state of the services
docker compose logs -f api worker         # follow the logs
docker compose up -d --scale worker=2     # a second worker for parallel jobs
```

### Update

With the `onyx` command of the installer, which goes back by itself when the new version does not come up:

```bash
onyx update
```

By hand:

```bash
git pull
./init-env.sh                 # adds secrets a newer version needs, changes nothing else
docker compose up -d --build
```

The `migrate` service updates the database before the new API starts. By hand there is no way back but a backup: make one first, with the command below.

### Back up

Three things hold your data: the database, the storage volume and `.env`.

**The database** is backed up by the installation itself, every night, into the folder `backups` of the storage volume. The files are encrypted. The schedule, the number of backups kept and where they go are set in the panel under **Settings → Backups**, and so is downloading one. A backup right now, from the terminal:

```bash
docker compose run --rm api node dist/cli/backup.js create \
  /var/lib/onyx/storage/backups/by-hand.onyxbackup
```

**The storage volume** holds the videos, and those backups. Copy it somewhere else:

```bash
docker run --rm -v onyx_storage:/data -v "$PWD":/backup alpine \
  tar czf /backup/onyx-storage-$(date +%F).tar.gz -C /data .
```

**`.env`** holds `MASTER_KEY`. The database backups are encrypted under it and none of them opens without it. Keep a copy of the file somewhere other than this server.

### Restore

```bash
# Check that the backup opens. Changes nothing.
docker compose run --rm api node dist/cli/backup.js verify /var/lib/onyx/storage/backups/<file>

docker compose stop api worker live
docker compose run --rm api node dist/cli/backup.js restore /var/lib/onyx/storage/backups/<file> \
  --yes --save-current /var/lib/onyx/storage/backups/before-restore.onyxbackup
docker compose up -d
```

The panel shows the same commands with the file name filled in: **Settings → Backups → How to restore**. What a restore does and does not bring back is described in [docs/phase-6-operations.md](../../docs/phase-6-operations.md#restoring).

### Remove

```bash
docker compose down        # stops everything and keeps the data
docker compose down -v     # also deletes the database and all videos
```

## Settings

All settings are in `.env`. See `.env.example` for the list. After a change run `docker compose up -d`.

`PLAYBACK_SIGNING_SECRET` is used by both the API and the gateway. Changing it makes every playback URL handed out so far invalid.
