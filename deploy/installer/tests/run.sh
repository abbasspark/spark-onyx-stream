#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
#
# Tests of the installer's own logic: reading its options, checking what was
# typed, and writing the settings file. They change nothing on the machine and
# need neither root nor Docker.
#
#   bash deploy/installer/tests/run.sh

set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../install.sh
ONYX_INSTALLER_LIB=1 source "$HERE/../install.sh"
set +e

PASSED=0
FAILED=0
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

pass() { PASSED=$((PASSED + 1)); }
fail() {
  FAILED=$((FAILED + 1))
  printf 'FAIL  %s\n' "$1"
}

# equals <what> <expected> <actual>
equals() {
  if [[ "$2" == "$3" ]]; then pass; else fail "$1: expected \"$2\", got \"$3\""; fi
}
# yes <what> <command ...> and no <what> <command ...>
yes() {
  local what="$1"
  shift
  if "$@"; then pass; else fail "$what"; fi
}
no() {
  local what="$1"
  shift
  if "$@"; then fail "$what"; else pass; fi
}
# stops <what> <text the message must hold> <command ...>: the command must
# end the installer with that explanation. Run apart, so it ends only itself.
stops() {
  local what="$1" text="$2" output
  shift 2
  if output=$("$@" 2>&1); then
    fail "$what: went on"
  elif [[ "$output" == *"$text"* ]]; then
    pass
  else
    fail "$what: said \"$output\""
  fi
}

# --- What was typed -----------------------------------------------------------

yes 'a domain' valid_domain watch.example.com
yes 'a domain with a hyphen' valid_domain my-site.example.co.uk
yes 'a domain for trying out' valid_domain onyx.localhost
no 'a domain with the scheme' valid_domain https://watch.example.com
no 'a domain with a path' valid_domain watch.example.com/admin
no 'a bare word' valid_domain localhost
no 'an address' valid_domain 203.0.113.7
no 'a domain with a space' valid_domain 'watch example.com'
no 'a domain with an underscore' valid_domain watch_me.example.com
no 'a domain that starts with a hyphen' valid_domain -watch.example.com
no 'an empty domain' valid_domain ''
no 'a domain with a command in it' valid_domain 'a.com;reboot'

yes 'port 80' valid_port 80
yes 'port 65535' valid_port 65535
yes 'a port with a leading zero' valid_port 08080
no 'port 0' valid_port 0
no 'port 65536' valid_port 65536
no 'a port in words' valid_port eighty
no 'a negative port' valid_port -1
no 'an empty port' valid_port ''

yes 'a plain site name' valid_site_name 'Onyx Stream'
yes 'a site name with marks' valid_site_name "Kino & Friends – 24/7!"
no 'a site name with a dollar' valid_site_name 'Cash$Money'
no 'a site name with a quote' valid_site_name 'Abbas"s'
no 'a site name with a comment sign' valid_site_name 'Channel #1'
no 'a site name with a backtick' valid_site_name 'a`id`'
no 'a site name that starts with a space' valid_site_name ' Onyx'
no 'an empty site name' valid_site_name ''
no 'a site name of 61 characters' valid_site_name "$(printf 'x%.0s' {1..61})"

equals 'major of a version' 27 "$(major_of 27.3.1)"
equals 'major of a version with a suffix' 24 "$(major_of 24.0.7-ce)"

# --- Addresses ----------------------------------------------------------------

equals 'address with a domain' 'https://watch.example.com' "$(site_url_of watch.example.com 203.0.113.7 8080)"
equals 'address without a domain' 'http://203.0.113.7:8080' "$(site_url_of '' 203.0.113.7 8080)"
equals 'address on port 80' 'http://203.0.113.7' "$(site_url_of '' 203.0.113.7 80)"
equals 'tracker behind HTTPS' 'wss://watch.example.com/tracker' "$(tracker_url_of https://watch.example.com)"
equals 'tracker without HTTPS' 'ws://203.0.113.7:8080/tracker' "$(tracker_url_of http://203.0.113.7:8080)"

# --- The settings file --------------------------------------------------------

ENV="$WORK/.env"
printf '%s\n' '# A comment' 'SITE_NAME=Onyx Stream' 'MASTER_KEY=abc123' '#ONYX_DOMAIN=watch.example.com' 'EMPTY=' >"$ENV"

equals 'reads a value' 'Onyx Stream' "$(get_env SITE_NAME "$ENV")"
equals 'reads an empty value' '' "$(get_env EMPTY "$ENV")"
equals 'reads nothing for a missing key' '' "$(get_env NOPE "$ENV")"
equals 'does not read a commented line' '' "$(get_env ONYX_DOMAIN "$ENV")"

set_env SITE_NAME 'Kino & Friends' "$ENV"
equals 'replaces a value' 'Kino & Friends' "$(get_env SITE_NAME "$ENV")"
equals 'leaves the other values' 'abc123' "$(get_env MASTER_KEY "$ENV")"
equals 'keeps the comment' '# A comment' "$(head -n 1 "$ENV")"

set_env ONYX_DOMAIN 'kino.example.org' "$ENV"
equals 'fills in a commented line' 'kino.example.org' "$(get_env ONYX_DOMAIN "$ENV")"
equals 'in its place, not at the end' '4' "$(grep -n '^ONYX_DOMAIN=' "$ENV" | cut -d: -f1)"

set_env NEW_KEY 'value' "$ENV"
equals 'adds a missing key' 'value' "$(get_env NEW_KEY "$ENV")"
equals 'adds it once' '1' "$(grep -c '^NEW_KEY=' "$ENV")"

# Values that would break a sed replacement, or run something if evaluated.
HARD='a/b&c\d|e $(reboot) `id` "q"'
set_env MAIL_FROM "$HARD" "$ENV"
equals 'writes any value as it is' "$HARD" "$(get_env MAIL_FROM "$ENV")"
set_env MAIL_FROM 'again' "$ENV"
equals 'replaces it again' '1' "$(grep -c '^MAIL_FROM=' "$ENV")"

equals 'the file is for its owner only' '600' "$(stat -c %a "$ENV")"
equals 'no temporary file is left' '1' "$(find "$WORK" -maxdepth 1 -name '.env*' | wc -l | tr -d ' ')"

printf 'LAST=no newline' >"$WORK/.env2"
set_env OTHER x "$WORK/.env2"
equals 'keeps a last line without a line end' 'no newline' "$(get_env LAST "$WORK/.env2")"

# --- Options ------------------------------------------------------------------

parse() { (parse_args "$@" && printf '%s|%s|%s|%s|%s|%s|%s' "$OPT_DOMAIN" "$OPT_SITE_NAME" "$OPT_PORT" "$OPT_DIR" "$OPT_REF" "$OPT_YES" "$OPT_BUILD"); }

equals 'no options' '||||main|0|1' "$(parse)"
equals 'every option' 'watch.example.com|My Site|9000|/srv/onyx|v1.2.0|1|0' \
  "$(parse --domain watch.example.com --site-name 'My Site' --port 9000 --dir /srv/onyx --ref v1.2.0 --yes --no-build)"
equals 'a domain in capitals' 'watch.example.com' "$(parse --domain Watch.Example.COM | cut -d'|' -f1)"

stops 'an unknown option' 'Unknown option: --fast' parse_args --fast
stops 'an option without its value' '--domain needs a value' parse_args --domain
stops 'a domain with a scheme' 'is not a domain' parse_args --domain https://watch.example.com
stops 'a port out of range' 'is not a port' parse_args --port 70000
stops 'a site name with a quote' 'site name cannot be used' parse_args --site-name 'a"b'
stops 'a folder that is not a full path' 'must be a full path' parse_args --dir onyx
yes 'help ends well' bash -c "ONYX_INSTALLER_LIB=1 source '$HERE/../install.sh'; parse_args --help >/dev/null"

# --- The server ---------------------------------------------------------------

stops 'without root' 'This needs root' bash -c "
  ONYX_INSTALLER_LIB=1 source '$HERE/../install.sh'
  id() { echo 1000; }
  INSTALL_DIR=/opt/onyx-stream
  check_server"
stops 'on a Mac' 'for Linux servers' bash -c "
  ONYX_INSTALLER_LIB=1 source '$HERE/../install.sh'
  uname() { echo Darwin; }
  INSTALL_DIR=/opt/onyx-stream
  check_server"
stops 'on a 32-bit machine' 'not supported' bash -c "
  ONYX_INSTALLER_LIB=1 source '$HERE/../install.sh'
  id() { echo 0; }
  uname() { if [[ \"\$1\" == -m ]]; then echo armv7l; else echo Linux; fi; }
  INSTALL_DIR=/opt/onyx-stream
  check_server"
stops 'a folder that holds something else' 'holds something else' bash -c "
  ONYX_INSTALLER_LIB=1 source '$HERE/../install.sh'
  mkdir -p '$WORK/taken' && touch '$WORK/taken/file'
  INSTALL_DIR='$WORK/taken' COMPOSE_DIR='$WORK/taken/deploy/compose' ENV_FILE='$WORK/taken/deploy/compose/.env'
  fetch_code"

stops 'a database without its settings' 'database of an earlier installation' bash -c "
  ONYX_INSTALLER_LIB=1 source '$HERE/../install.sh'
  mkdir -p '$WORK/fresh/deploy/compose'
  docker() { [[ \"\$1 \$2\" == 'volume inspect' ]]; }
  port_in_use() { return 1; }
  STEP=0 OPT_YES=1 ADDRESS=203.0.113.7
  COMPOSE_DIR='$WORK/fresh/deploy/compose' ENV_FILE='$WORK/fresh/deploy/compose/.env'
  write_settings"
stops 'a port that is taken' 'Port 8080 is in use' bash -c "
  ONYX_INSTALLER_LIB=1 source '$HERE/../install.sh'
  mkdir -p '$WORK/fresh/deploy/compose'
  port_in_use() { return 0; }
  STEP=0 OPT_YES=1 ADDRESS=203.0.113.7
  COMPOSE_DIR='$WORK/fresh/deploy/compose' ENV_FILE='$WORK/fresh/deploy/compose/.env'
  write_settings"
stops 'a web server in the way of HTTPS' 'Port 80 is in use' bash -c "
  ONYX_INSTALLER_LIB=1 source '$HERE/../install.sh'
  mkdir -p '$WORK/fresh/deploy/compose'
  port_in_use() { return 0; }
  check_domain() { :; }
  STEP=0 OPT_YES=1 OPT_DOMAIN=watch.example.com ADDRESS=203.0.113.7
  COMPOSE_DIR='$WORK/fresh/deploy/compose' ENV_FILE='$WORK/fresh/deploy/compose/.env'
  write_settings"

# Writing the settings of a first installation, with and without a domain.
settings() {
  local name="$1"
  shift
  mkdir -p "$WORK/$name"
  cp "$HERE/../../compose/.env.example" "$HERE/../../compose/init-env.sh" "$WORK/$name/"
  (
    docker() { return 1; }
    port_in_use() { return 1; }
    check_domain() { :; }
    STEP=0 OPT_YES=1 ADDRESS=203.0.113.7
    COMPOSE_DIR="$WORK/$name" ENV_FILE="$WORK/$name/.env"
    "$@"
    write_settings >/dev/null
  )
}
with_domain() { OPT_DOMAIN=watch.example.com OPT_SITE_NAME='Kino & Friends'; }
without_domain() { OPT_PORT=9000; }

settings tls with_domain
T="$WORK/tls/.env"
equals 'with a domain: the address' 'https://watch.example.com' "$(get_env SITE_URL "$T")"
equals 'with a domain: the name' 'Kino & Friends' "$(get_env SITE_NAME "$T")"
equals 'with a domain: the tracker' 'wss://watch.example.com/tracker' "$(get_env P2P_TRACKER_URL "$T")"
equals 'with a domain: the HTTPS proxy is added' 'docker-compose.yml:docker-compose.tls.yml' "$(get_env COMPOSE_FILE "$T")"
equals 'with a domain: its name for the certificate' 'watch.example.com' "$(get_env ONYX_DOMAIN "$T")"
equals 'with a domain: the gateway is not reachable from outside' '127.0.0.1' "$(get_env HTTP_BIND "$T")"
equals 'with a domain: two proxies are trusted' '2' "$(get_env TRUST_PROXY_HOPS "$T")"
equals 'with a domain: the sender of emails' 'Kino & Friends <no-reply@watch.example.com>' "$(get_env MAIL_FROM "$T")"
equals 'the master key is 64 characters' '64' "$(get_env MASTER_KEY "$T" | tr -d '\n' | wc -c | tr -d ' ')"
equals 'every secret is filled in' '0' "$(grep -cE '^(POSTGRES_PASSWORD|JWT_SECRET|PLAYBACK_SIGNING_SECRET|MASTER_KEY|P2P_TRACKER_SECRET)=$' "$T")"
equals 'each key is there once' '' "$(grep -oE '^[A-Z0-9_]+=' "$T" | sort | uniq -d)"

settings plain without_domain
P="$WORK/plain/.env"
equals 'without a domain: the address' 'http://203.0.113.7:9000' "$(get_env SITE_URL "$P")"
equals 'without a domain: the port' '9000' "$(get_env HTTP_PORT "$P")"
equals 'without a domain: the tracker' 'ws://203.0.113.7:9000/tracker' "$(get_env P2P_TRACKER_URL "$P")"
equals 'without a domain: no HTTPS proxy' '' "$(get_env COMPOSE_FILE "$P")"
equals 'without a domain: reachable from outside' '0.0.0.0' "$(get_env HTTP_BIND "$P")"
equals 'without a domain: one proxy is trusted' '1' "$(get_env TRUST_PROXY_HOPS "$P")"
no 'two installations share no secret' test "$(get_env MASTER_KEY "$T")" = "$(get_env MASTER_KEY "$P")"

# A second run keeps what is there.
BEFORE=$(cat "$P")
# shellcheck disable=SC2034
settings_again() {
  (
    docker() { return 1; }
    STEP=0 OPT_YES=1 OPT_DOMAIN=other.example.com ADDRESS=203.0.113.7
    COMPOSE_DIR="$WORK/plain" ENV_FILE="$P"
    write_settings 2>&1
  )
}
AGAIN=$(settings_again)
equals 'a second run changes no setting' "$BEFORE" "$(cat "$P")"
yes 'and says that the domain was not applied' grep -q 'were not applied' <<<"$AGAIN"

# --- The everyday command -----------------------------------------------------

ONYX="$HERE/../onyx"
yes 'onyx help' bash -c "'$ONYX' help | grep -q 'onyx restore <file>'"
yes 'onyx without a command shows the help' bash -c "'$ONYX' | grep -q 'onyx status'"
equals 'onyx env names the settings file' "$(cd "$HERE/../../compose" && pwd)/.env" "$("$ONYX" env | head -n 1)"
stops 'onyx without an installation' 'No installation found' env ONYX_COMPOSE_DIR="$WORK/none" "$ONYX" status
yes 'onyx works through a link' bash -c "ln -sf '$ONYX' '$WORK/onyx' && '$WORK/onyx' env | head -n 1 | grep -q 'deploy/compose/.env'"

# --- Updates ------------------------------------------------------------------

# A small installation of its own: a repository with two versions, and the
# place it was fetched from.
git_quiet() { git -c user.name=Test -c user.email=test@example.com -c init.defaultBranch=main "$@" >/dev/null 2>&1; }
SOURCE="$WORK/source"
INSTALLED="$WORK/installed"
mkdir -p "$SOURCE/deploy/installer" "$SOURCE/deploy/compose" "$SOURCE/packages/database/prisma/migrations/2026_first"
cp "$ONYX" "$SOURCE/deploy/installer/onyx"
echo 'services: {}' >"$SOURCE/deploy/compose/docker-compose.yml"
echo 'CREATE TABLE a();' >"$SOURCE/packages/database/prisma/migrations/2026_first/migration.sql"
git_quiet -C "$SOURCE" init && git_quiet -C "$SOURCE" add -A && git_quiet -C "$SOURCE" commit -m 'first version'
FIRST=$(git -C "$SOURCE" rev-parse HEAD)
git_quiet clone "$SOURCE" "$INSTALLED"
echo 'HTTP_PORT=8080' >"$INSTALLED/deploy/compose/.env"

mkdir -p "$SOURCE/packages/database/prisma/migrations/2026_second" "$SOURCE/packages/database/prisma/migrations/2026_third"
echo 'CREATE TABLE b();' >"$SOURCE/packages/database/prisma/migrations/2026_second/migration.sql"
echo 'CREATE TABLE c();' >"$SOURCE/packages/database/prisma/migrations/2026_third/migration.sql"
echo '-- a comment' >>"$SOURCE/packages/database/prisma/migrations/2026_first/migration.sql"
echo 'new' >"$SOURCE/README.md"
git_quiet -C "$SOURCE" add -A && git_quiet -C "$SOURCE" commit -m 'second version'
SECOND=$(git -C "$SOURCE" rev-parse HEAD)
git_quiet -C "$SOURCE" tag v2
echo 'newer' >"$SOURCE/README.md"
git_quiet -C "$SOURCE" add -A && git_quiet -C "$SOURCE" commit -m 'third version'
THIRD=$(git -C "$SOURCE" rev-parse HEAD)

# Runs a piece of the command inside that installation, with Docker played by a stand-in.
in_installation() {
  ONYX_LIB=1 ONYX_STATE_DIR="$WORK/state" bash -c "
    source '$INSTALLED/deploy/installer/onyx'
    docker() { return 0; }
    $1"
}

equals 'the note of an update starts empty' '' "$(in_installation 'state_get STATUS')"
in_installation 'state_set STATUS building; state_set FROM abc; state_set STATUS updated; state_set BRANCH ""'
equals 'a value is kept' 'abc' "$(in_installation 'state_get FROM')"
equals 'a value is replaced, not added twice' 'updated' "$(in_installation 'state_get STATUS')"
equals 'the note has one line per key' '3' "$(wc -l <"$WORK/state/update" | tr -d ' ')"
equals 'an empty value is kept as empty' '' "$(in_installation 'state_get BRANCH')"
equals 'the folder is for its owner only' '700' "$(stat -c %a "$WORK/state")"

equals 'finds the newest version of the branch installed' "$THIRD" "$(in_installation 'fetch_target ""')"
equals 'finds a version by its tag' "$SECOND" "$(in_installation 'fetch_target v2')"
stops 'a version that does not exist' 'could not be fetched' in_installation 'fetch_target v99'
equals 'counts the migrations a version adds, not the ones it edits' '2' "$(in_installation "fetch_target '' >/dev/null; migrations_between $FIRST $THIRD")"
equals 'counts none between the same version' '0' "$(in_installation "migrations_between $FIRST $FIRST")"
equals 'counts none going to a version without new ones' '0' "$(in_installation "fetch_target '' >/dev/null; migrations_between $SECOND $THIRD")"

equals 'no changes by hand at first' '' "$(in_installation 'local_changes')"
echo 'services: {changed: true}' >"$INSTALLED/deploy/compose/docker-compose.yml"
yes 'notices a file changed by hand' grep -q 'docker-compose.yml' <<<"$(in_installation 'local_changes')"
equals 'the settings file is not a change' '1' "$(in_installation 'local_changes' | wc -l | tr -d ' ')"
stops 'an update over files changed by hand' 'changed by hand' in_installation 'need_installation() { :; }; cmd_update --yes'
git_quiet -C "$INSTALLED" checkout -- deploy/compose/docker-compose.yml

yes 'says when there is a newer version' grep -q 'A newer version is there' <<<"$(in_installation 'cmd_update --check')"
yes 'and how much of it touches the database' grep -q '2 changes, with 2 to the structure of the database' <<<"$(in_installation 'cmd_update --check')"
equals 'checking changes nothing' "$FIRST" "$(git -C "$INSTALLED" rev-parse HEAD)"
stops 'an update nobody confirmed' 'Not confirmed' in_installation 'has_terminal() { return 1; }; cmd_update'
stops 'an unknown option of update' 'Unknown option' in_installation 'cmd_update --fast'

in_installation "checkout $SECOND main"
equals 'tells the application which version it is' "$SECOND" "$(get_env ONYX_COMMIT "$INSTALLED/deploy/compose/.env")"
equals 'and leaves the other settings alone' '8080' "$(get_env HTTP_PORT "$INSTALLED/deploy/compose/.env")"
equals 'moves the files and keeps the branch' "main $SECOND" "$(git -C "$INSTALLED" symbolic-ref --short HEAD) $(git -C "$INSTALLED" rev-parse HEAD)"
in_installation "checkout $FIRST ''"
equals 'or stays at an exact version' "$FIRST" "$(git -C "$INSTALLED" rev-parse HEAD)"
no 'which is on no branch' git -C "$INSTALLED" symbolic-ref --quiet HEAD
stops 'updating a fixed version without saying where to' 'at a fixed version' in_installation 'fetch_target ""'
in_installation "checkout $THIRD main"
yes 'says when nothing is newer' grep -q 'This is the newest version' <<<"$(in_installation 'cmd_update')"

rm -r "$WORK/state"
stops 'a rollback without an update before it' 'nothing to go back to' in_installation 'cmd_rollback --yes'
in_installation "state_set FROM $FIRST; state_set TO $THIRD; state_set STATUS rolled-back; touch \"\$ROLLBACK_DUMP\""
stops 'a rollback that was done already' 'from before the last update already' in_installation 'cmd_rollback --yes'
in_installation 'state_set STATUS updated'
stops 'a rollback nobody confirmed' 'Not confirmed' in_installation 'has_terminal() { return 1; }; cmd_rollback'
stops 'a rollback whose images are gone' 'rollback is gone' in_installation 'docker() { return 1; }; cmd_rollback --yes'
yes 'the status names the way back' grep -q 'To undo it: onyx rollback' <<<"$(in_installation 'update_note')"
in_installation 'state_set STATUS switching'
yes 'and an update that was cut off' grep -q 'was cut off' <<<"$(in_installation 'update_note')"
in_installation 'mkdir "$STATE_DIR/lock"'
stops 'two updates at once' 'running already' in_installation 'take_lock'

printf '%d passed, %d failed\n' "$PASSED" "$FAILED"
[[ "$FAILED" -eq 0 ]]
