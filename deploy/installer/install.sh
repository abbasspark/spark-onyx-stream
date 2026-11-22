#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
#
# Installs Spark Onyx Stream on a server, start to finish:
#
#   curl -fsSL https://raw.githubusercontent.com/abbasspark/spark-onyx-stream/main/deploy/installer/install.sh | sudo bash
#
# With a domain that points at the server, the site gets HTTPS by itself:
#
#   curl -fsSL .../install.sh | sudo bash -s -- --domain watch.example.com
#
# It checks the server, installs Docker when it is missing, fetches the code,
# writes the settings with fresh secrets, builds and starts everything, and
# waits until the site answers. Run again, it carries on where it stopped and
# never replaces settings or secrets that exist.
#
# Everything is inside functions and started by the last line, so a download
# that was cut off does nothing.

set -Eeuo pipefail

REPO_DEFAULT="https://github.com/abbasspark/spark-onyx-stream.git"
DIR_DEFAULT="/opt/onyx-stream"
REF_DEFAULT="main"
PORT_DEFAULT="8080"
MIN_DOCKER_MAJOR=24
# The first build compiles the API, the panel and the website.
MIN_MEMORY_MB=1900
MIN_DISK_MB=10000
HEALTH_WAIT_SECONDS=300
# The volume of the database, as Docker Compose names it for the project "onyx".
DATABASE_VOLUME="onyx_postgres-data"

# What the person asked for. Set by parse_args.
OPT_DOMAIN=""
OPT_SITE_NAME=""
OPT_PORT=""
OPT_DIR=""
OPT_REPO="$REPO_DEFAULT"
OPT_REF="$REF_DEFAULT"
OPT_YES=0
OPT_BUILD=1
OPT_INSTALL_DOCKER=1
OPT_COMMAND=1

# --- Talking to the person ----------------------------------------------------

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  BOLD=$'\033[1m' DIM=$'\033[2m' RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m' RESET=$'\033[0m'
else
  BOLD="" DIM="" RED="" GREEN="" YELLOW="" RESET=""
fi

STEP=0
STEPS=6

step() {
  STEP=$((STEP + 1))
  printf '\n%s[%d/%d] %s%s\n' "$BOLD" "$STEP" "$STEPS" "$1" "$RESET"
}
say() { printf '      %s\n' "$*"; }
ok() { printf '   %s✓%s  %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '   %s!%s  %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die() {
  printf '\n%sStopped:%s %s\n' "$RED" "$RESET" "$1" >&2
  shift
  local line
  for line in "$@"; do
    printf '         %s\n' "$line" >&2
  done
  exit 1
}

# Whether questions can be asked. Piped into bash, the script itself is on
# standard input, so answers are read from the terminal.
# The file can exist without a terminal behind it, so it is tried.
can_ask() { [[ "$OPT_YES" -eq 0 ]] && { : >/dev/tty; } 2>/dev/null; }

# ask <question> <default>: prints the answer.
ask() {
  local answer=""
  printf '   %s?%s  %s%s: ' "$BOLD" "$RESET" "$1" "${2:+ [$2]}" >/dev/tty
  IFS= read -r answer </dev/tty || true
  printf '%s' "${answer:-$2}"
}

# confirm <question>: true when the person agrees, and always with --yes.
confirm() {
  [[ "$OPT_YES" -eq 1 ]] && return 0
  can_ask || return 1
  local answer
  answer=$(ask "$1 (y/n)" "y")
  [[ "$answer" =~ ^[Yy] ]]
}

usage() {
  cat <<EOF
Installs Spark Onyx Stream on this server.

  install.sh [options]

  --domain <name>     Domain of the site, such as watch.example.com. It must
                      point at this server. The site then gets HTTPS by itself.
                      Without it, the site is reached at http://<server>:<port>.
  --site-name <name>  Name of the site, shown to viewers. Default: Onyx Stream
  --port <number>     Port of the site when there is no domain. Default: $PORT_DEFAULT
  --dir <path>        Where to install. Default: $DIR_DEFAULT
  --ref <name>        Branch or tag to install. Default: $REF_DEFAULT
  --repo <address>    Where to fetch the code from, for forks
  --yes               Ask nothing. What was not given keeps its default
  --no-build          Start with images that are on this server already
  --no-docker         Do not install Docker. Stop when it is missing
  --no-command        Do not install the "onyx" command
  --help              Show this

Run again on an installed server, it changes no setting and no secret. It
builds what is new and starts what is not running.
EOF
}

# --- Small tools --------------------------------------------------------------

have() { command -v "$1" >/dev/null 2>&1; }

# valid_domain <name>: a host name with at least one dot, or something.localhost.
valid_domain() {
  [[ ${#1} -le 253 && "$1" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]]
}

valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && ((10#$1 >= 1 && 10#$1 <= 65535))
}

# A name that can stand in .env without quotes and in a page title.
valid_site_name() {
  [[ -n "$1" && ${#1} -le 60 && ! "$1" =~ [\$\"\'\\\`\#] && "$1" == "${1# }" && "$1" == "${1% }" ]]
}

# major_of "27.3.1" prints 27.
major_of() {
  local major="${1%%.*}"
  printf '%s' "${major//[^0-9]/}"
}

# get_env <key> <file>: prints the value, or nothing.
get_env() {
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$1="* ]]; then
      printf '%s' "${line#*=}"
      return 0
    fi
  done <"$2"
  return 0
}

# set_env <key> <value> <file>: sets one line and leaves every other as it is.
# Written to a new file that takes the place of the old one, so a crash in
# between cannot leave half a file. No sed: values may hold any character.
set_env() {
  local key="$1" value="$2" file="$3" line found=0 tmp
  tmp=$(mktemp "$file.XXXXXX")
  chmod 600 "$tmp"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$key="* || "$line" == "#$key="* ]] && [[ "$found" -eq 0 ]]; then
      printf '%s=%s\n' "$key" "$value"
      found=1
    else
      printf '%s\n' "$line"
    fi
  done <"$file" >"$tmp"
  if [[ "$found" -eq 0 ]]; then
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  mv "$tmp" "$file"
}

# site_url_of <domain> <address> <port>
site_url_of() {
  if [[ -n "$1" ]]; then
    printf 'https://%s' "$1"
  elif [[ "$3" == "80" ]]; then
    printf 'http://%s' "$2"
  else
    printf 'http://%s:%s' "$2" "$3"
  fi
}

# tracker_url_of <site url>: the same address for WebSocket, with /tracker.
tracker_url_of() {
  local url="$1"
  url="${url/#https:/wss:}"
  url="${url/#http:/ws:}"
  printf '%s/tracker' "$url"
}

# The address this server uses to reach the internet. Behind address
# translation it is not the address others reach the server at.
server_address() {
  local address=""
  if have ip; then
    address=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n 1 || true)
  fi
  if [[ -z "$address" ]] && have hostname; then
    address=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  fi
  printf '%s' "${address:-localhost}"
}

# port_in_use <port>: true when something listens on the TCP port.
port_in_use() {
  have ss || return 1
  [[ -n "$(ss -ltnH "sport = :$1" 2>/dev/null)" ]]
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain | --site-name | --port | --dir | --ref | --repo)
        [[ $# -ge 2 ]] || die "$1 needs a value." "See --help."
        case "$1" in
          --domain) OPT_DOMAIN="${2,,}" ;;
          --site-name) OPT_SITE_NAME="$2" ;;
          --port) OPT_PORT="$2" ;;
          --dir) OPT_DIR="$2" ;;
          --ref) OPT_REF="$2" ;;
          --repo) OPT_REPO="$2" ;;
        esac
        shift 2
        ;;
      --yes | -y) OPT_YES=1 && shift ;;
      --no-build) OPT_BUILD=0 && shift ;;
      --no-docker) OPT_INSTALL_DOCKER=0 && shift ;;
      --no-command) OPT_COMMAND=0 && shift ;;
      --help | -h) usage && exit 0 ;;
      *) die "Unknown option: $1" "See --help." ;;
    esac
  done

  if [[ -n "$OPT_DOMAIN" ]] && ! valid_domain "$OPT_DOMAIN"; then
    die "\"$OPT_DOMAIN\" is not a domain." "Give it without https:// and without a path, such as watch.example.com."
  fi
  if [[ -n "$OPT_PORT" ]] && ! valid_port "$OPT_PORT"; then
    die "\"$OPT_PORT\" is not a port." "Give a number from 1 to 65535."
  fi
  if [[ -n "$OPT_SITE_NAME" ]] && ! valid_site_name "$OPT_SITE_NAME"; then
    die "The site name cannot be used." "Leave out quotes, \$, #, \\ and \`, and keep it under 60 characters."
  fi
  if [[ -n "$OPT_DIR" && "$OPT_DIR" != /* ]]; then
    die "--dir must be a full path, such as $DIR_DEFAULT."
  fi
}

# --- 1. The server ------------------------------------------------------------

check_server() {
  step "Checking this server"

  [[ "$(uname -s)" == "Linux" ]] ||
    die "This installer is for Linux servers." "On a Mac or on Windows, use Docker Desktop and the steps in deploy/compose/README.md."
  [[ "$(id -u)" -eq 0 ]] ||
    die "This needs root." "Run it with sudo."

  local machine
  machine=$(uname -m)
  case "$machine" in
    x86_64 | amd64 | aarch64 | arm64) ok "Linux on $machine" ;;
    *) die "Processors of the kind \"$machine\" are not supported." "A 64-bit Intel, AMD or ARM server is needed." ;;
  esac

  local memory_mb=0 swap_mb=0
  if [[ -r /proc/meminfo ]]; then
    memory_mb=$(($(sed -n 's/^MemTotal: *\([0-9]*\).*/\1/p' /proc/meminfo) / 1024))
    swap_mb=$(($(sed -n 's/^SwapTotal: *\([0-9]*\).*/\1/p' /proc/meminfo) / 1024))
  fi
  if ((memory_mb + swap_mb < MIN_MEMORY_MB)) && [[ "$OPT_BUILD" -eq 1 ]]; then
    warn "$memory_mb MB of memory and $swap_mb MB of swap. Building needs about 2 GB."
    say "The build may be stopped by the system half way. Adding swap helps:"
    say "${DIM}fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile${RESET}"
    confirm "Go on anyway?" || die "Not enough memory to build." "Add swap as shown above, or use a larger server, and run this again."
  else
    ok "$memory_mb MB of memory"
  fi

  local parent="$INSTALL_DIR"
  while [[ ! -d "$parent" ]]; do parent=$(dirname "$parent"); done
  local free_mb
  free_mb=$(($(df -Pk "$parent" | awk 'NR == 2 {print $4}') / 1024))
  if ((free_mb < MIN_DISK_MB)); then
    warn "$free_mb MB free on the disk of $parent. The images alone take about 4 GB, and videos come on top."
    confirm "Go on anyway?" || die "Not enough free disk." "Free some space or add a disk, and run this again."
  else
    ok "$((free_mb / 1024)) GB free on disk"
  fi
}

# --- 2. What the installation needs -------------------------------------------

install_packages() {
  local missing=()
  local tool
  for tool in git curl openssl; do
    have "$tool" || missing+=("$tool")
  done
  [[ ${#missing[@]} -eq 0 ]] && return 0

  say "Installing ${missing[*]} ..."
  if have apt-get; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates "${missing[@]}" >/dev/null
  elif have dnf; then
    dnf install -y -q ca-certificates "${missing[@]}" >/dev/null
  elif have yum; then
    yum install -y -q ca-certificates "${missing[@]}" >/dev/null
  elif have zypper; then
    zypper --non-interactive --quiet install ca-certificates "${missing[@]}" >/dev/null
  else
    die "${missing[*]} must be installed, and this system's package manager is not one I know." "Install them by hand and run this again."
  fi
}

check_tools() {
  step "Checking what the installation needs"

  install_packages
  ok "git, curl and openssl"

  if ! have docker; then
    [[ "$OPT_INSTALL_DOCKER" -eq 1 ]] ||
      die "Docker is not installed." "Install Docker Engine $MIN_DOCKER_MAJOR or newer with the Compose plugin: https://docs.docker.com/engine/install/"
    confirm "Docker is not installed. Install it now, with Docker's own script from get.docker.com?" ||
      die "Docker is needed." "Install Docker Engine with the Compose plugin and run this again: https://docs.docker.com/engine/install/"
    say "Installing Docker ..."
    local script
    script=$(mktemp)
    curl -fsSL https://get.docker.com -o "$script" ||
      die "Docker's install script could not be downloaded." "Check the connection of this server to the internet."
    sh "$script" >/dev/null 2>&1 ||
      die "Docker could not be installed by its own script." "Install it by hand and run this again: https://docs.docker.com/engine/install/"
    rm -f "$script"
  fi

  if have systemctl && [[ -d /run/systemd/system ]]; then
    # Started now, and with the server from here on.
    systemctl enable --now docker >/dev/null 2>&1 || true
  fi
  docker info >/dev/null 2>&1 ||
    die "Docker is installed but does not answer." "Start it, for example with: systemctl start docker"

  local version
  version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)
  if [[ -n "$version" ]] && (($(major_of "$version") < MIN_DOCKER_MAJOR)); then
    die "Docker $version is too old." "Version $MIN_DOCKER_MAJOR or newer is needed: https://docs.docker.com/engine/install/"
  fi
  docker compose version >/dev/null 2>&1 ||
    die "Docker is there, but its Compose plugin is not." "Install the package docker-compose-plugin and run this again."
  ok "Docker ${version:-} with Compose $(docker compose version --short 2>/dev/null || true)"
}

# --- 3. The code --------------------------------------------------------------

fetch_code() {
  step "Fetching Spark Onyx Stream"

  if [[ -f "$COMPOSE_DIR/docker-compose.yml" ]]; then
    ok "Already in $INSTALL_DIR"
    if [[ -f "$ENV_FILE" ]]; then
      say "It is left at the version it has. Settings and secrets are not touched."
    fi
    return 0
  fi
  if [[ -e "$INSTALL_DIR" ]] && [[ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
    die "$INSTALL_DIR exists and holds something else." "Choose another place with --dir, or empty the folder."
  fi

  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --quiet --depth 1 --branch "$OPT_REF" "$OPT_REPO" "$INSTALL_DIR" ||
    die "The code could not be fetched from $OPT_REPO ($OPT_REF)." "Check the connection of this server to the internet, and the name given with --ref."
  [[ -f "$COMPOSE_DIR/docker-compose.yml" ]] ||
    die "What was fetched is not Spark Onyx Stream: deploy/compose is missing."
  ok "$OPT_REF in $INSTALL_DIR"
}

# --- 4. The settings ----------------------------------------------------------

# Warns when the domain does not lead to this server. Not an error: behind a
# load balancer or address translation the addresses differ and all is well.
check_domain() {
  have getent || return 0
  local resolved
  resolved=$(getent ahosts "$1" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)
  if [[ -z "$resolved" ]]; then
    warn "$1 does not lead anywhere yet. Without that, no certificate can be fetched."
    say "Create an A record for it that points at this server ($ADDRESS)."
    say "The installation goes on. HTTPS starts working by itself once the record is there."
    return 0
  fi
  local own
  own=$( (have hostname && hostname -I 2>/dev/null) || true)
  local address
  for address in $resolved; do
    [[ " $own $ADDRESS " == *" $address "* ]] && return 0
  done
  warn "$1 leads to ${resolved% }, which is not an address of this server ($ADDRESS)."
  say "That is fine behind a load balancer or a router that passes ports 80 and 443 on."
  say "Otherwise correct the DNS record: no certificate can be fetched until it is right."
}

write_settings() {
  step "Writing the settings"

  if [[ -f "$ENV_FILE" ]]; then
    # An installation from an earlier version may lack secrets newer ones need.
    (cd "$COMPOSE_DIR" && ./init-env.sh >/dev/null 2>&1) || true
    ok "$ENV_FILE exists and was kept as it is"
    if [[ -n "$OPT_DOMAIN$OPT_SITE_NAME$OPT_PORT" ]]; then
      warn "--domain, --site-name and --port are for a first installation and were not applied."
      say "Change them in $ENV_FILE and run: onyx restart"
    fi
    return 0
  fi

  local domain="$OPT_DOMAIN" site_name="$OPT_SITE_NAME" port="${OPT_PORT:-$PORT_DEFAULT}"

  if [[ -z "$domain" ]] && can_ask; then
    say "With a domain that points at this server, the site gets HTTPS by itself."
    say "Without one it is reached at http://$ADDRESS:$port, which is for trying things out."
    while :; do
      domain=$(ask "Domain of the site, or nothing" "")
      domain="${domain,,}"
      [[ -z "$domain" ]] && break
      valid_domain "$domain" && break
      warn "\"$domain\" is not a domain. Give it like watch.example.com, without https://."
    done
  fi
  if [[ -z "$site_name" ]] && can_ask; then
    while :; do
      site_name=$(ask "Name of the site, as viewers see it" "Onyx Stream")
      valid_site_name "$site_name" && break
      warn "Leave out quotes, \$, #, \\ and \`, and keep it under 60 characters."
    done
  fi
  site_name="${site_name:-Onyx Stream}"

  if [[ -n "$domain" ]]; then
    check_domain "$domain"
    local busy
    for busy in 80 443; do
      if port_in_use "$busy"; then
        die "Port $busy is in use by another program, and HTTPS needs it." "Stop that program (often a web server: nginx, apache2, caddy), or install without --domain and keep your own proxy in front."
      fi
    done
  elif port_in_use "$port"; then
    die "Port $port is in use by another program." "Choose another one with --port."
  fi

  # Fresh secrets do not open a database that was made with other ones.
  if docker volume inspect "$DATABASE_VOLUME" >/dev/null 2>&1; then
    die "This server holds the database of an earlier installation, and its settings file is gone." \
      "The database opens only with the password in the .env it was installed with." \
      "To keep the data: put your copy of that file at $ENV_FILE and run this again." \
      "To start from nothing, which deletes that database: docker volume rm $DATABASE_VOLUME"
  fi

  (cd "$COMPOSE_DIR" && ./init-env.sh >/dev/null) ||
    die "The settings file could not be created." "Run $COMPOSE_DIR/init-env.sh to see why."

  local site_url
  site_url=$(site_url_of "$domain" "$ADDRESS" "$port")
  set_env SITE_NAME "$site_name" "$ENV_FILE"
  set_env SITE_URL "$site_url" "$ENV_FILE"
  set_env MAIL_FROM "$site_name <no-reply@${domain:-example.com}>" "$ENV_FILE"
  set_env P2P_TRACKER_URL "$(tracker_url_of "$site_url")" "$ENV_FILE"
  set_env HTTP_PORT "$port" "$ENV_FILE"
  if [[ -n "$domain" ]]; then
    set_env COMPOSE_FILE "docker-compose.yml:docker-compose.tls.yml" "$ENV_FILE"
    set_env ONYX_DOMAIN "$domain" "$ENV_FILE"
    # Only the HTTPS proxy is reachable from outside, and it is a second proxy
    # in front of the API.
    set_env HTTP_BIND "127.0.0.1" "$ENV_FILE"
    set_env TRUST_PROXY_HOPS "2" "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
  ok "$ENV_FILE written, with fresh secrets"
  ok "Address of the site: $site_url"
}

# --- 5. Build and start -------------------------------------------------------

compose() {
  (cd "$COMPOSE_DIR" && docker compose "$@")
}

start_everything() {
  step "Building and starting"

  # Told to the application, so the panel can say which version runs.
  local commit
  commit=$(git -c safe.directory="$INSTALL_DIR" -C "$INSTALL_DIR" rev-parse HEAD 2>/dev/null || true)
  if [[ -n "$commit" ]]; then
    set_env ONYX_COMMIT "$commit" "$ENV_FILE"
  fi

  if [[ "$OPT_BUILD" -eq 1 ]]; then
    say "The first build takes 5 to 15 minutes, depending on the server."
    compose build ||
      die "The build failed." "The lines above say where. A build that is \"Killed\" ran out of memory: add swap and run this again."
    ok "Built"
  fi
  compose up -d --no-build --remove-orphans ||
    die "Not everything started." "See what is wrong with: cd $COMPOSE_DIR && docker compose ps && docker compose logs --tail 50"
  ok "Started"
}

# --- 6. Wait until it answers -------------------------------------------------

wait_until_up() {
  step "Waiting for the site to answer"

  local port url waited=0
  port=$(get_env HTTP_PORT "$ENV_FILE")
  url="http://127.0.0.1:${port:-$PORT_DEFAULT}/v1/health/live"
  until curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; do
    if ((waited >= HEALTH_WAIT_SECONDS)); then
      compose ps || true
      die "The site did not answer within $((HEALTH_WAIT_SECONDS / 60)) minutes." "See what is wrong with: cd $COMPOSE_DIR && docker compose logs --tail 50 api gateway"
    fi
    sleep 3
    waited=$((waited + 3))
  done
  ok "It answers"
}

install_command() {
  [[ "$OPT_COMMAND" -eq 1 ]] || return 0
  local tool="$INSTALL_DIR/deploy/installer/onyx"
  [[ -f "$tool" ]] || return 0
  chmod +x "$tool"
  if ln -sf "$tool" /usr/local/bin/onyx 2>/dev/null; then
    ok "The command \"onyx\" is installed. Try: onyx status"
  fi
}

finish() {
  local site_url domain
  site_url=$(get_env SITE_URL "$ENV_FILE")
  domain=$(get_env ONYX_DOMAIN "$ENV_FILE")

  cat <<EOF

${GREEN}${BOLD}Spark Onyx Stream is running.${RESET}

  ${BOLD}Create the first admin now:${RESET}  $site_url/admin
  The site for viewers:        $site_url

  Whoever opens the admin address first becomes the owner. Do it before
  anyone else finds the server.

${BOLD}Keep a copy of this file somewhere other than this server:${RESET}
  $ENV_FILE
  It holds MASTER_KEY. Backups and encrypted videos cannot be opened without it.

${BOLD}Good to know${RESET}
  - Everything is in $INSTALL_DIR. Settings: $ENV_FILE
  - The database is backed up every night. See Settings > Backups in the panel.
  - Live channels pushed by an encoder use the ports 1935 (TCP) and 8890 (UDP).
EOF
  if [[ -n "$domain" ]]; then
    cat <<EOF
  - The certificate for $domain is fetched in the first minute. Ports 80 and
    443 must be reachable from the internet for that.
EOF
  else
    cat <<EOF
  - ${YELLOW}This address has no HTTPS.${RESET} Passwords travel unprotected: fine for
    trying things out, not for viewers. For a real site, point a domain at the
    server and see "HTTPS" in $COMPOSE_DIR/README.md.
EOF
  fi
  if [[ "$OPT_COMMAND" -eq 1 && -x /usr/local/bin/onyx ]]; then
    cat <<EOF
  - Day to day: onyx status, onyx logs, onyx backup, onyx restart. All of it: onyx help
EOF
  fi
  printf '\n'
}

# A command that fails where no failure was foreseen must not end the
# installation without a word.
unexpected() {
  die "Something failed that was not expected to (line $1 of the installer)." \
    "Nothing was removed. It is safe to run the installer again." \
    "If it stops here again, please report it: https://github.com/abbasspark/spark-onyx-stream/issues"
}

main() {
  parse_args "$@"
  trap 'unexpected "$LINENO"' ERR

  INSTALL_DIR="${OPT_DIR:-$DIR_DEFAULT}"
  INSTALL_DIR="${INSTALL_DIR%/}"
  COMPOSE_DIR="$INSTALL_DIR/deploy/compose"
  ENV_FILE="$COMPOSE_DIR/.env"
  ADDRESS=$(server_address)

  printf '%sSpark Onyx Stream%s installer\n' "$BOLD" "$RESET"

  check_server
  check_tools
  fetch_code
  write_settings
  start_everything
  wait_until_up
  install_command
  finish
}

# Tests load the functions without running the installation.
if [[ -z "${ONYX_INSTALLER_LIB:-}" ]]; then
  main "$@"
fi
