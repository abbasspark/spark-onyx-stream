# syntax=docker/dockerfile:1.7
# SPDX-License-Identifier: AGPL-3.0-only
#
# Builds the two images of Spark Onyx Stream:
#
#   api      The NestJS application with FFmpeg. One image for every role;
#            APP_ROLE chooses what a container does (api, worker, ...).
#   gateway  Nginx with the admin panel. It passes API calls on and serves
#            media files itself after checking the playback token.
#
#   docker build --target api -t onyx-stream/api .
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
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm db:generate \
 && pnpm --filter @onyx/api build \
 && pnpm --filter @onyx/admin build

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
    PROCESSING_TEMP_PATH=/var/lib/onyx/processing

# FFmpeg does the media work. tini passes stop signals on, so jobs end cleanly.
RUN apt-get update \
 && apt-get install --yes --no-install-recommends ffmpeg tini \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --global pnpm@${PNPM_VERSION} && npm cache clean --force \
 && mkdir -p /var/lib/onyx/storage /var/lib/onyx/uploads /var/lib/onyx/processing \
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

# --- gateway: Nginx with the admin panel -----------------------------------------
FROM ${NGINX_IMAGE} AS gateway
COPY deploy/nginx/nginx.conf deploy/nginx/proxy-api.conf deploy/nginx/security-headers.conf /etc/nginx/
COPY deploy/nginx/njs /etc/nginx/njs
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
# The official image can run without root: all writable paths are under /tmp.
USER nginx
EXPOSE 8080
