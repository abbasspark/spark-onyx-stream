# edge-agent

The program that runs on an edge server. It delivers video to viewers in place of the main server: it checks the token in every address, sends a copy of the file it kept, or fetches the file from the main server first.

One program without dependencies, written in Go with the standard library only. See [docs/phase-5-edges.md](../../docs/phase-5-edges.md) for how edges work and how to set one up.

## Build and test

```bash
cd services/edge-agent
go test ./...
go build -o onyx-edge-agent ./cmd/edge-agent
```

Go 1.23 or newer. For another system, set `GOOS` and `GOARCH`, for example `GOOS=linux GOARCH=arm64 go build …`. A Docker image is built with `docker build -t onyx-edge-agent .`.

## Settings

| Variable               | Default   | Meaning                                                          |
| ---------------------- | --------- | ---------------------------------------------------------------- |
| `ONYX_ORIGIN_URL`      | required  | Address of the main server, such as `https://stream.example.com` |
| `ONYX_EDGE_TOKEN`      | required  | Token shown when the edge was added in the admin panel           |
| `ONYX_EDGE_TOKEN_FILE` |           | A file holding the token, instead of `ONYX_EDGE_TOKEN`           |
| `ONYX_EDGE_LISTEN`     | `:8080`   | Address viewers are served on                                    |
| `ONYX_EDGE_CACHE_DIR`  | `./cache` | Folder for the copies                                            |
| `ONYX_EDGE_CACHE_SIZE` | `20GB`    | How much may be kept, such as `50GB`. At least `64MB`            |
| `ONYX_EDGE_TLS_CERT`   |           | Certificate file, to serve HTTPS without a proxy in front        |
| `ONYX_EDGE_TLS_KEY`    |           | Key file of the certificate                                      |

`GET /healthz` answers 200 once the agent is connected to the main server, and 503 before.

## Layout

| Package            | Job                                                            |
| ------------------ | -------------------------------------------------------------- |
| `cmd/edge-agent`   | Start, heartbeats, HTTPS with certificates that are read again |
| `internal/server`  | Answers viewers: token, copies, fetching, live playlists       |
| `internal/cache`   | Copies on disk up to a size, least recently used first to go   |
| `internal/origin`  | Requests to the main server                                    |
| `internal/token`   | The playback token, in step with the API's                     |
| `internal/config`  | Settings from the environment                                  |
| `internal/stats`   | Counters for the heartbeat                                     |
| `internal/sysinfo` | Load and disk space of the machine                             |
