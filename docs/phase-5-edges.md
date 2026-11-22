# Phase 5: Edges and P2P

Phase 5 takes the load of delivery off the main server. It starts with edge servers: machines close to viewers that deliver video in place of the main server. P2P between viewers comes after them, and its first part, the tracker, is described near the end.

## What an edge is

An edge is a server that runs one program, the edge agent. Viewers who are sent to it get playlists and segments from it instead of from the main server.

- **It keeps copies.** The first viewer who asks for a file makes the agent fetch it from the main server. Everyone after that gets the copy. The main server sends a file once per edge instead of once per viewer.
- **It holds nothing that matters.** No database, no settings beyond its own. An edge can be stopped, wiped or replaced at any time. What it kept is fetched again when asked for.
- **It connects to the main server, never the other way round.** An edge needs one open port, the one for viewers. The main server needs to know nothing but that the edge exists.
- **It serves video on demand and live channels**, each of which can be switched off per edge.

```
viewer ──▶ website / API (main server): "play this"  ──▶ address on an edge, signed for that edge
viewer ──▶ edge: playlist, segments ──▶ copy on disk, or fetched from the main server once
edge   ──▶ main server: heartbeat every 10 seconds, and the files it does not have
```

## Setting one up

1. In the panel, open **Delivery → Edge servers** and add the edge: a name, the address viewers reach it at, and its weight.
2. The panel shows the token of the agent, once, with the settings to start it with.
3. Start the agent on the server. As soon as it reports, the panel shows it online and new viewers are sent to it.

With Docker and automatic HTTPS, on the edge:

```bash
git clone https://github.com/abbasspark/spark-onyx-stream.git
cd spark-onyx-stream/deploy/edge
cp .env.example .env     # the address of the main server, the token, the domain of this edge
docker compose up -d --build
```

This runs the agent with Caddy in front of it, which gets and renews the certificate for the domain by itself. The domain must point to the server, and ports 80 and 443 must be reachable.

Without Docker, build the one program and run it as a service:

```bash
cd services/edge-agent
go build -o /usr/local/bin/onyx-edge-agent ./cmd/edge-agent
```

```ini
# /etc/systemd/system/onyx-edge.service
[Service]
EnvironmentFile=/etc/onyx-edge.env
ExecStart=/usr/local/bin/onyx-edge-agent
Restart=always
User=onyx
```

**An edge needs HTTPS when the website uses it.** A browser does not play video from an `http://` address on an `https://` page. Put a proxy with a certificate in front, as the Compose file does, or give the agent a certificate with `ONYX_EDGE_TLS_CERT` and `ONYX_EDGE_TLS_KEY`. It reads the files again when they change, so a renewed certificate needs no restart.

**Use HTTPS between edge and main server too.** The token of the edge and the files travel over that connection.

### Settings of the agent

| Variable               | Default   | Meaning                                                          |
| ---------------------- | --------- | ---------------------------------------------------------------- |
| `ONYX_ORIGIN_URL`      | required  | Address of the main server, such as `https://stream.example.com` |
| `ONYX_EDGE_TOKEN`      | required  | Token shown when the edge was added                              |
| `ONYX_EDGE_TOKEN_FILE` |           | A file holding the token, instead of `ONYX_EDGE_TOKEN`           |
| `ONYX_EDGE_LISTEN`     | `:8080`   | Address viewers are served on                                    |
| `ONYX_EDGE_CACHE_DIR`  | `./cache` | Folder for the copies                                            |
| `ONYX_EDGE_CACHE_SIZE` | `20GB`    | How much may be kept. At least `64MB`                            |
| `ONYX_EDGE_TLS_CERT`   |           | Certificate file, to serve HTTPS itself                          |
| `ONYX_EDGE_TLS_KEY`    |           | Key file of the certificate                                      |

## Who is sent where

When a viewer starts a video or a channel, the API chooses a server for that session and signs the address for it.

- **Edges that can take viewers** are those that are switched on and reported within the last 35 seconds. When there is none, the main server delivers, as it did before.
- **A video goes to one of two edges,** always the same two for the same video. Copies of a video are then on two edges instead of thinly on all of them. Which two follows from the video and the edges alone (weighted rendezvous hashing), so adding or removing an edge moves only the videos of that edge.
- **A live channel goes to any edge,** by weight. What is kept of a channel is small and short-lived, and a popular channel needs every edge.
- **Weight** is an edge's share: one with weight 20 gets twice the viewers of one with weight 10.
- **Admins always watch from the main server,** so a preview in the panel shows what is stored and does not depend on an edge.
- **Pictures** (posters, backdrops) stay on the main server.

### When an edge goes away

- No new viewers are sent to it 35 seconds after its last report.
- **A player that loses its server asks for another one.** It names the server that failed (`?avoid=` on the playback request), so it is not sent there again while the main server still counts that edge as alive.
- **A viewer of a film** goes on where the video was. The player moves after three requests in a row failed, which in a test took about a second. It does so twice per page before it shows its error with "Try again".
- **A live viewer** moves when the player reports the stream as broken, or when the picture has stood still for twelve seconds.
- An edge that cannot reach the main server keeps serving what it has. Viewers whose video is on it go on watching; files it does not have fail, and their players move.

## Security

- **Every edge has its own key for playback tokens,** made from the platform's signing secret and the edge's own secret. An address signed for one edge works on that edge only. An edge never learns the platform's secret, so a server that is broken into cannot make addresses for the main server or for other edges.
- **The token of an edge is shown once** and stored as a hash. Whoever has it can fetch every video and every content key, so it is to be kept like a password. Replacing it locks the running agent out at once and takes the edge out of use until its agent is back with the new one.
- **Edges check tokens themselves,** the same way the main server does: wrong and run-out tokens get a plain 404.
- **Content keys of encrypted videos** are handed out by the edge to viewers with a valid token. It fetches them from the main server, keeps them in memory for a minute and never writes them to disk.
- **An edge serves nothing before its first heartbeat was answered,** and stops serving when the main server refuses its token.

## What the agent keeps, and for how long

- **Copies on disk** up to the size it is given. When that is reached, the copies not asked for the longest go first.
- **Files of a video** are kept under the processing they belong to. The agent asks the main server at most once a minute per video whether that is still current. A video that was processed again has its old copies dropped, and one that was deleted is no longer served, both within a minute.
- **Segments of a channel** never change and are kept until they are six hours old or space is needed.
- **Playlists of a channel** are fetched again after one second, however many viewers ask in between, and are sent packed to players that take it.
- **Many viewers asking for the same new file cause one fetch.**
- A restart keeps the copies.

## Emptying an edge

**Empty the copies** in the menu of an edge drops what it keeps: everything, the copies of films and episodes, or those of live channels. It is for an edge that serves something it should not, and for freeing its disk.

The request waits for the agent's next heartbeat, travels in the answer, and is taken off the list when the agent reports it as done with the heartbeat after that. The copies are gone within ten seconds, and the panel shows it as done within twenty. Viewers keep watching: what they ask for is fetched from the main server again. A request nobody confirmed is dropped after fifteen minutes.

A video that was processed again or deleted needs no emptying. The agent notices within a minute.

## What the panel shows

**Delivery → Edge servers** lists the edges with their state, traffic, the share of requests answered from copies, how full the cache is, and the traffic of the last hour. Above the list: how many are online, the traffic of all of them together and what they delivered in total. The details of an edge add the machine's load and disk space, refused requests and failed fetches, the version of the agent and where it connects from.

| State                 | Meaning                                                |
| --------------------- | ------------------------------------------------------ |
| Online                | Connected and taking viewers                           |
| Paused                | Connected, but switched off: no new viewers            |
| Offline               | The agent stopped reporting                            |
| Waiting for the agent | No agent has connected with the token of this edge yet |

**Delivered by the edges** shows what was delivered over the last 24 hours, 7 days or 30 days, edge by edge: a bar per hour for a day, a bar per day for longer. The same figures can be shown as a table. Days are those of the time zone of the computer the panel is open on.

The figures come from the heartbeats. Those of the last hour are kept in Redis. What each edge delivered per hour is kept in the database for 90 days, as are the totals.

## The viewer website

The website's content policy must allow every address video comes from. It asks the API for the addresses of the edges (`GET /v1/catalog/delivery`) and puts them into the policy of each page, so adding an edge needs no setting and no restart. A tab that was open before an edge was added loads itself again, once, when it is sent to that edge.

`WEB_MEDIA_ORIGIN` can list further origins, separated by spaces, and takes `https://*.example.com` for all subdomains.

## P2P between viewers: the tracker

Viewers who watch the same video or channel can pass parts of it to each other over direct connections (WebRTC). They find each other through the tracker, a small program that runs beside the main server. The main server tells players where it is and lets them in.

- **What the tracker does:** a player connects, says which swarm it is in, and sends offers for direct connections along. The tracker hands each offer to another player of the same swarm and carries the answer back. After that the two talk to each other. No video passes through the tracker.
- **A swarm** is the group of viewers who watch the same files: one per processing of a video, one per live channel. Its name is made by the main server from a secret, so it cannot be worked out from the video. Only a viewer who is let watch learns it, which keeps others out of the swarm.
- **Who is let in:** the main server gives every viewer it lets watch a token for the tracker, valid as long as the address of the video. The tracker refuses connections without one. It can also be limited to pages of your website (`ONYX_TRACKER_ALLOWED_ORIGINS`).
- **Admins get neither:** a preview in the panel shares nothing.
- **The protocol** is that of WebTorrent trackers over WebSocket, which the P2P library in the player speaks.
- **Limits per connection:** ten offers per announce, eight swarms, thirty messages at once and two a second after that. A connection that floods or sends what makes no sense is closed.
- **When the tracker is away,** viewers notice nothing: players get everything from the servers.

### Switching it on

Both sides need the same secret of 32 characters or more.

| Where       | Setting                    | Meaning                                                                            |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------- |
| Main server | `P2P_TRACKER_URL`          | Address for players, such as `wss://stream.example.com/tracker`. Empty: P2P is off |
| Main server | `P2P_TRACKER_INTERNAL_URL` | Where the API reads the tracker's figures. Default `http://127.0.0.1:8070`         |
| Main server | `P2P_TRACKER_SECRET`       | The shared secret                                                                  |
| Tracker     | `ONYX_TRACKER_SECRET`      | The same value                                                                     |

With Compose, `init-env.sh` makes the secret and the tracker runs as a service of its own. The gateway passes `/tracker` on to it. Set `P2P_TRACKER_URL` in `.env` to switch P2P on. The other settings of the tracker are in [services/tracker](../services/tracker/README.md).

**Delivery → P2P** in the panel shows whether the tracker runs, how many viewers are connected, how many swarms there are and how large the largest are, and how many of the offers passed on were answered. Switched off, it shows the settings for both sides with a fresh secret.

## P2P in the player

When P2P is switched on, the players of the website share what they play.

- **What is shared:** the segments of films, episodes and live channels. Playlists and content keys always come from a server.
- **Every part can come from a server.** What plays within the next seconds (15 for a film, 8 for a channel) is fetched over HTTP without waiting for anyone. Parts further ahead are asked of other viewers first. A viewer alone in a swarm plays exactly as without P2P.
- **Who shares with whom:** viewers of the same processing of a video in the same quality, and viewers of the same channel. It does not matter which server each of them was sent to: an edge, another edge or the main server.
- **The viewer decides.** The settings of the player have "Share with viewers", on by default, with a line that says how many others the player is connected to and how much came from them. The choice is kept in the browser. Switched off, the player neither takes from nor gives to others.
- **Not on mobile data:** a browser that reports a mobile network, or that the viewer asked to save data, does not share.
- **Where it does not work:** iPhones, where the browser plays HLS by itself, and previews in the panel. There, everything comes from the servers.
- **The code for sharing is loaded only when a video that can be shared is about to play.** If it cannot be loaded, the video plays without it.

In a test with three viewers in three browsers on one machine, the three got 48 to 80 percent of a film from each other, and two of three got over 60 percent of a live channel from the others.

### What to know before switching it on

- **Viewers see each other's network addresses.** A direct connection cannot be had without. Tell your viewers in your privacy notice, and decide whether the default suits your audience.
- **STUN servers:** players ask a STUN server for the address others can reach them at. The default is two public ones, of Google and Twilio, which then learn the addresses of your viewers. Set `P2P_STUN_URLS` to your own, or to nothing, with which only viewers in the same network connect.
- **No relay:** two viewers who are both behind strict routers cannot connect directly, and there is no TURN server to pass their data on. Those viewers get everything from the servers.
- **What comes from another viewer is not checked against the original.** A viewer who went to the trouble could send wrong data to others, whose players would show a broken picture or an error until they fetch from a server again. Encrypted videos cannot be read by someone who has no key, but they are not protected against this either.
- **Sharing uses the viewer's upload** and memory: up to 512 MB of a film and 256 MB of a channel are kept to give to others.

| Setting              | Default                 | Meaning                                                       |
| -------------------- | ----------------------- | ------------------------------------------------------------- |
| `P2P_STUN_URLS`      | two public STUN servers | STUN servers for players, separated by commas                 |
| `P2P_VIEWER_DEFAULT` | `on`                    | Whether players share until the viewer chooses: `on` or `off` |

## What was taken off the main server

Two figures say what edges and viewers save, and each is counted where it happens.

- **Edges:** an agent counts what it delivers and what it had to fetch from the main server to do so. The difference is what the edge took off the main server. **Delivery → Edge servers** shows it for the chosen time: "The main server sent 11 GB of that: the edges took 88% off it."
- **Viewers:** every player that can share counts what it took from servers and what it took from other viewers, and tells the site about twice a minute. **Delivery → P2P** shows it for the last 24 hours, 7 days or 30 days, for films, for live channels or both, as a chart and as a table.

What these figures are, and are not:

- **The viewers' figure is what players say.** A report is taken only from a player that was let watch, and no report may claim more than 4 GB, but a viewer who wants to can send wrong numbers. They are statistics and decide nothing.
- **It covers sharing players only.** Viewers on iPhones, on mobile data or with sharing switched off do not report, so what they took from your servers is not in it. The share that came from viewers is the share among those who can share, not among all viewers.
- **"From servers" in the viewers' figure means edges and the main server together.** A player cannot tell them apart.
- **Reports are added up in memory and written every half minute.** A process that is killed loses what it had not written. The hours are kept for 90 days.
- **An agent older than this step** reports nothing about what it fetched, and the panel then leaves the sentence out.

### The default for sharing

`P2P_VIEWER_DEFAULT` of the main server decides whether players share until the viewer says otherwise: `on` (the default) or `off`. A viewer's own choice in the player always wins and is kept in the browser.

## API

| Method and path                     | Who              | Purpose                                                          |
| ----------------------------------- | ---------------- | ---------------------------------------------------------------- |
| `GET /v1/edges`                     | `delivery:read`  | All edges with state, figures and traffic history                |
| `GET /v1/edges/:id`                 | `delivery:read`  | One edge                                                         |
| `POST /v1/edges`                    | `delivery:write` | Add an edge. The answer carries its token, once                  |
| `PATCH /v1/edges/:id`               | `delivery:write` | Change an edge, pause it or switch it on                         |
| `POST /v1/edges/:id/token`          | `delivery:write` | Replace the token                                                |
| `DELETE /v1/edges/:id`              | `delivery:write` | Remove an edge and lock its agent out                            |
| `POST /v1/edges/:id/purge`          | `delivery:write` | Ask the agent to drop its copies: `all`, `video` or `live`       |
| `GET /v1/edges/traffic?range=`      | `delivery:read`  | What each edge delivered per hour: `24h`, `7d` or `30d`          |
| `GET /v1/p2p`                       | `delivery:read`  | Whether P2P is on, and the figures of the tracker                |
| `GET /v1/p2p/traffic?range=`        | `delivery:read`  | What players reported per hour: `24h`, `7d` or `30d`             |
| `POST /v1/catalog/delivery/report`  | a player         | What it took from servers and from viewers since its last report |
| `GET /v1/catalog/delivery`          | everyone         | The addresses of the edges, for the website                      |
| `POST /v1/edge-agent/heartbeat`     | the agent        | Report, and get the key for checking tokens                      |
| `GET /v1/edge-agent/assets/:id`     | the agent        | Whether a video can be played, and its current processing        |
| `GET /v1/edge-agent/media/:id/…`    | the agent        | A file of a video, or its content key                            |
| `GET /v1/edge-agent/live/:id/:file` | the agent        | A playlist or segment of a channel                               |

`delivery:read` and `delivery:write` are held by owners and admins. Changes are written to the audit log. An agent that speaks an older version of this conversation than the main server is refused and stays offline.

## Not built yet

- Sending viewers to the nearest edge by country or network, and limits per edge (bandwidth, connections)
- Filling the copies of an edge ahead of a premiere, and emptying one video only
- Traffic per title and per country, and what the main server itself delivered
- Edges that fetch from other edges, and edges for pictures
- Sending the first bytes of a new file to the viewer while it is still being fetched
- Updating agents from the panel
- One figure for everything the main server itself sent, which needs counting in the gateway
- Figures per title, per channel and per country
- A TURN server for viewers who cannot connect directly, and checking what comes from other viewers
- P2P in apps, and on iPhones
- Several trackers behind one address, and names of videos and channels beside the swarms in the panel
