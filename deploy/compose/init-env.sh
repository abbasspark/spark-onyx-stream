#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
#
# Creates .env next to this script from .env.example and fills in fresh
# secrets. It never replaces a secret of an existing .env, because that would
# lock you out of your own data. It only adds the ones a newer version needs.
set -eu

cd "$(dirname "$0")"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is needed to create the secrets. Install it and run this again." >&2
  exit 1
fi

secret() {
  openssl rand -hex 32
}

# Secrets that later versions brought. An installation from before them gets
# them added, and nothing else in its .env is touched.
LATER_SECRETS="P2P_TRACKER_SECRET"

if [ -e .env ]; then
  added=""
  for key in $LATER_SECRETS; do
    if grep -q "^$key=." .env; then
      continue
    fi
    if grep -q "^$key=" .env; then
      sed -i.bak "s/^$key=.*/$key=$(secret)/" .env && rm -f .env.bak
    else
      printf '\n%s=%s\n' "$key" "$(secret)" >> .env
    fi
    added="$added $key"
  done
  if [ -n "$added" ]; then
    echo "Added to the existing .env:$added"
    echo "Everything else in it was left unchanged."
    exit 0
  fi
  echo ".env already exists and was left unchanged." >&2
  exit 1
fi

umask 077
sed \
  -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(secret)/" \
  -e "s/^JWT_SECRET=.*/JWT_SECRET=$(secret)/" \
  -e "s/^PLAYBACK_SIGNING_SECRET=.*/PLAYBACK_SIGNING_SECRET=$(secret)/" \
  -e "s/^MASTER_KEY=.*/MASTER_KEY=$(secret)/" \
  -e "s/^P2P_TRACKER_SECRET=.*/P2P_TRACKER_SECRET=$(secret)/" \
  .env.example > .env

echo "Created $(pwd)/.env with fresh secrets."
echo "Keep a copy of this file in a safe place."
