# syntax=docker/dockerfile:1.7
# SPDX-License-Identifier: AGPL-3.0-only
#
# Builds the three images of Spark Onyx Stream:
#
#   api      The NestJS application with FFmpeg. One image for every role;
#            APP_ROLE chooses what a container does (api, worker, ...).
#   web      The viewer website, a Next.js server.
#   gateway  Nginx with the admin panel. It passes API calls and the website
#            on and serves media files itself after checking the playback token.
#
#   docker build --target api -t onyx-stream/api .
#   docker build --target web -t onyx-stream/web .
#   docker build --target gateway -t onyx-stream/gateway .

ARG NODE_IMAGE=node:24-trixie-slim
ARG NGINX_IMAGE=nginx:1.29-alpine
ARG PNPM_VERSION=12.21.0

# --- Shared base: Node with pnpm ---------------------------------------------
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN npm install --global pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /repo

# --- Build: compile the API, the database package and the admin panel ----------
FROM base AS build
# Package manifests first, so dependencies are installed again only when they change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY packages/database/package.json packages/database/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/database packages/database
COPY apps/api apps/api
COPY apps/admin apps/admin
# Generating the database client reads the configuration, which asks for a
# database address. Nothing connects to it during the build.
# The gateway serves the panel under /admin/. The root is the viewer website.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm db:generate \
 && pnpm --filter @onyx/api build \
 && ADMIN_BASE_PATH=/admin/ pnpm --filter @onyx/admin build

# --- Production dependencies only ----------------------------------------------
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/database/package.json packages/database/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@onyx/api..."

# --- api: the application image --------------------------------------------------
FROM ${NODE_IMAGE} AS api
ARG PNPM_VERSION
ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    API_HOST=0.0.0.0 \
    API_PORT=3000 \
    STORAGE_LOCAL_PATH=/var/lib/onyx/storage \
    UPLOAD_TEMP_PATH=/var/lib/onyx/uploads \
    PROCESSING_TEMP_PATH=/var/lib/onyx/processing \
    LIVE_PATH=/var/lib/onyx/live

# FFmpeg does the media work. tini passes stop signals on, so jobs end cleanly.
# The PostgreSQL client brings pg_dump and pg_restore, which backups are made
# and restored with. It must be no older than the database server.
RUN apt-get update \
 && apt-get install --yes --no-install-recommends ffmpeg tini postgresql-client \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --global pnpm@${PNPM_VERSION} && npm cache clean --force \
 && mkdir -p /var/lib/onyx/storage /var/lib/onyx/uploads /var/lib/onyx/processing /var/lib/onyx/live \
 && chown -R node:node /var/lib/onyx

WORKDIR /app
COPY --from=prod-deps --chown=node:node /repo ./
COPY --from=build --chown=node:node /repo/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /repo/packages/database/dist packages/database/dist
# The migration files and their configuration, for "migrate:deploy".
COPY --chown=node:node packages/database/prisma packages/database/prisma
COPY --chown=node:node packages/database/prisma.config.ts packages/database/

USER node
WORKDIR /app/apps/api
EXPOSE 3000
VOLUME ["/var/lib/onyx/storage", "/var/lib/onyx/uploads"]
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/main.js"]

# --- Build of the viewer website -----------------------------------------------
# A stage of its own, so building the API does not wait for the website and
# the other way round.
FROM base AS web-build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@onyx/web..."

COPY tsconfig.base.json ./
COPY apps/web apps/web
# "standalone" writes a server with only the files it needs. Nothing about the
# installation is fixed here: the site reads its settings when it starts.
RUN NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 pnpm --filter @onyx/web build

# --- web: the viewer website -----------------------------------------------------
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3001

WORKDIR /app
COPY --from=web-build --chown=node:node /repo/apps/web/.next/standalone ./
# The server does not include the files browsers download. They go next to it.
COPY --from=web-build --chown=node:node /repo/apps/web/.next/static apps/web/.next/static

USER node
EXPOSE 3001
CMD ["node", "apps/web/server.js"]

# --- gateway: Nginx with the admin panel -----------------------------------------
FROM ${NGINX_IMAGE} AS gateway
COPY deploy/nginx/nginx.conf deploy/nginx/proxy-api.conf deploy/nginx/proxy-web.conf deploy/nginx/security-headers.conf /etc/nginx/
COPY deploy/nginx/njs /etc/nginx/njs
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html/admin
# The official image can run without root: all writable paths are under /tmp.
USER nginx
EXPOSE 8080
