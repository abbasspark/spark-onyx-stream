#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
#
# Creates .env next to this script from .env.example and fills in fresh
# secrets. It never changes an existing .env, because replacing the secrets
# of a running installation would lock you out of your own data.
set -eu

cd "$(dirname "$0")"

if [ -e .env ]; then
  echo ".env already exists and was left unchanged." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is needed to create the secrets. Install it and run this again." >&2
  exit 1
fi

secret() {
  openssl rand -hex 32
}

umask 077
sed \
  -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(secret)/" \
  -e "s/^JWT_SECRET=.*/JWT_SECRET=$(secret)/" \
  -e "s/^PLAYBACK_SIGNING_SECRET=.*/PLAYBACK_SIGNING_SECRET=$(secret)/" \
  -e "s/^MASTER_KEY=.*/MASTER_KEY=$(secret)/" \
  .env.example > .env

echo "Created $(pwd)/.env with fresh secrets."
echo "Keep a copy of this file in a safe place."
