# tracker

The program through which the players of viewers find each other for P2P. A player connects with a token of the main server, says what it watches, and has its offers for direct connections passed on to others who watch the same. Video never passes through it.

It speaks the protocol of WebTorrent trackers over WebSocket, which the P2P library in the player uses. See [docs/phase-5-edges.md](../../docs/phase-5-edges.md) for how it fits in.

## Build and test

```bash
cd services/tracker
go test ./...
go build -o onyx-tracker ./cmd/tracker
```

Go 1.23 or newer. One dependency, for WebSocket: `github.com/coder/websocket`.

## Settings

| Variable                       | Default  | Meaning                                                                     |
| ------------------------------ | -------- | --------------------------------------------------------------------------- |
| `ONYX_TRACKER_SECRET`          | required | The value of `P2P_TRACKER_SECRET` of the main server, 32 characters or more |
| `ONYX_TRACKER_LISTEN`          | `:8070`  | Address players connect to                                                  |
| `ONYX_TRACKER_ALLOWED_ORIGINS` | any      | Websites whose pages may connect, such as `stream.example.com`              |
| `ONYX_TRACKER_MAX_CONNECTIONS` | `50000`  | Players at a time                                                           |
| `ONYX_TRACKER_MAX_PER_ADDRESS` | `200`    | Players from one address                                                    |
| `ONYX_TRACKER_TRUST_PROXY`     | `false`  | `true` behind a proxy that sets `X-Forwarded-For`                           |

`GET /healthz` answers 200. `GET /stats` gives its figures to the main server, which signs in with a short-lived token made from the secret.

## Layout

| Package           | Job                                                         |
| ----------------- | ----------------------------------------------------------- |
| `cmd/tracker`     | Start and stop                                              |
| `internal/server` | Connections: who is let in, limits per connection, figures  |
| `internal/hub`    | Swarms: who watches the same, passing offers and answers on |
| `internal/token`  | The token players connect with, in step with the API's      |
| `internal/config` | Settings from the environment                               |
