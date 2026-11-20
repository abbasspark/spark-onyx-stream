# Single-server installation with Docker Compose

Runs the whole platform on one server: PostgreSQL, Redis, the API, a worker and an Nginx gateway with the admin panel.

```
            ┌──────────── gateway (Nginx, port 8080) ────────────┐
browser ───▶│  /            admin panel                           │
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

```bash
cd deploy/compose
./init-env.sh                 # once: writes .env with fresh secrets
docker compose up -d --build  # builds the two images and starts everything
```

Open `http://<server>:8080` and create the first admin.

**Keep a copy of `.env` in a safe place.** Without `MASTER_KEY`, encrypted videos cannot be played and stored S3 credentials cannot be read.

## What runs

| Service    | Image                 | Job                                                         |
| ---------- | --------------------- | ----------------------------------------------------------- |
| `gateway`  | `onyx-stream/gateway` | Nginx: admin panel, media files, passes `/v1` on to the API |
| `api`      | `onyx-stream/api`     | REST API and uploads (`APP_ROLE=api,scheduler`)             |
| `worker`   | `onyx-stream/api`     | Processing with FFmpeg (`APP_ROLE=worker`)                  |
| `migrate`  | `onyx-stream/api`     | Brings the database to the current version, then ends       |
| `postgres` | `postgres:17-alpine`  | Database                                                    |
| `redis`    | `redis:7-alpine`      | Job queue                                                   |

Only the gateway is reachable from outside. The API, the database and Redis have no published ports.

## How media is served

The gateway checks the playback token of every media request itself, with a small script (`deploy/nginx/njs/media.js`) that uses the same secret as the API. Files of the local storage pool are then sent straight from disk. Anything it does not find there, such as an asset in an S3 pool, and the content keys of encrypted assets are passed on to the API.

The gateway does not ask the database. When an asset is deleted, a cleanup job removes its files, usually within seconds, and from then on the gateway answers its playback URLs with 404.

## TLS

The gateway speaks plain HTTP. Put a TLS proxy in front of it, for example Caddy, Traefik or the load balancer of your hosting provider, and:

- send its traffic to port 8080 of this server
- make it set `X-Forwarded-Proto` and `X-Forwarded-For`
- set `TRUST_PROXY_HOPS=2` in `.env`, so the audit log shows the real client address

Do not put the installation on the public internet without TLS: sign-in passwords and session tokens would travel unprotected.

## Everyday tasks

```bash
docker compose ps                         # state of the services
docker compose logs -f api worker         # follow the logs
docker compose up -d --scale worker=2     # a second worker for parallel jobs
```

### Update

```bash
git pull
docker compose up -d --build
```

The `migrate` service updates the database before the new API starts.

### Back up

Three things hold your data: the database, the storage volume and `.env`.

```bash
docker compose exec -T postgres pg_dump -U onyx onyx | gzip > onyx-$(date +%F).sql.gz
docker run --rm -v onyx_storage:/data -v "$PWD":/backup alpine \
  tar czf /backup/onyx-storage-$(date +%F).tar.gz -C /data .
```

### Remove

```bash
docker compose down        # stops everything and keeps the data
docker compose down -v     # also deletes the database and all videos
```

## Settings

All settings are in `.env`. See `.env.example` for the list. After a change run `docker compose up -d`.

`PLAYBACK_SIGNING_SECRET` is used by both the API and the gateway. Changing it makes every playback URL handed out so far invalid.
