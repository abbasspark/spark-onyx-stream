# Monitoring

The API can report numbers about itself to a monitoring system such as Prometheus, at `GET /v1/metrics`, in the Prometheus text format.

## Switching it on

The endpoint is off until a token is set. With no `METRICS_TOKEN` the address answers 404, as if it did not exist. Set one and restart the API:

```bash
openssl rand -hex 32     # put the result in METRICS_TOKEN
```

The token must be at least 32 characters. A request has to send it as `Authorization: Bearer <token>`. An admin session or an API key does not open the endpoint: a scraper is not a person, and a leaked scraper token should open nothing else.

The gateway passes `/v1/` through to the API, so the address is reachable from the internet. The token is what protects it. Keep it secret and rotate it by changing `METRICS_TOKEN`. The endpoint has no rate limit, because the counters of the limit are kept in Redis, and this is the address to ask when Redis is down. The token is long enough that guessing it is not a way in.

## A Prometheus setup

```yaml
scrape_configs:
  - job_name: onyx
    metrics_path: /v1/metrics
    scheme: https
    authorization:
      credentials_file: /etc/prometheus/onyx-token
    static_configs:
      - targets: ['watch.example.com']
```

## What it reports

| Metric                                                           | Type      | What it says                                                                                                         |
| ---------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| `onyx_build_info{version}`                                       | gauge     | The running version. Always 1.                                                                                       |
| `onyx_http_requests_total`                                       | counter   | Requests answered, by `method`, `route` and `status`.                                                                |
| `onyx_http_request_duration_seconds`                             | histogram | How long requests took, by `method` and `route`.                                                                     |
| `onyx_queue_jobs{queue,state}`                                   | gauge     | Jobs of the processing queue: waiting, active, delayed, failed and completed.                                        |
| `onyx_dependency_up{dependency}`                                 | gauge     | 1 when the database or Redis answers, 0 when it does not.                                                            |
| `onyx_instances{role}`                                           | gauge     | Processes that reported in lately, by role (`api`, `worker`, `scheduler`, `live`). 0 for a role nobody has.          |
| `onyx_instance_memory_bytes{host,pid,roles}`                     | gauge     | Memory a process holds. One series for each running process, whatever its roles.                                     |
| `onyx_instance_uptime_seconds{host,pid,roles,version}`           | gauge     | How long a process has been running, and which version it runs.                                                      |
| `onyx_disk_free_bytes`, `onyx_disk_total_bytes{host,pid,folder}` | gauge     | Free space and size of the working folders of a process: `uploads`, `processing` and `live`.                         |
| `onyx_live_channels{state}`                                      | gauge     | Channels switched on (`wanted`) and channels a live process is running (`running`). A gap is a channel that is down. |
| `onyx_streams_active`                                            | gauge     | Videos being played right now by viewers who are signed in.                                                          |
| `onyx_metrics_collect_failures_total{figure}`                    | counter   | Times a figure could not be read while answering a scrape.                                                           |
| `onyx_process_*`, `onyx_nodejs_*`                                | various   | CPU, memory, open files, event loop lag and garbage collection of the process that answers.                          |

The workers, the live process and the scheduler have no HTTP server of their own. They report to Redis every fifteen seconds, and the API process includes what they said, so there is one address to scrape. A process that has been silent for fifty seconds is taken to be gone, and its series disappear. `onyx_process_*` is the API process alone; for the others use `onyx_instance_*`.

A figure that cannot be read, because the database or Redis is down or too slow, leaves out only itself and is counted in `onyx_metrics_collect_failures_total`. The rest of the answer is still sent, so `onyx_dependency_up` can say that something is down. Each figure gets three seconds.

Some alerts worth having:

- `onyx_instances{role="worker"} == 0`: nothing processes uploads.
- `onyx_live_channels{state="wanted"} > onyx_live_channels{state="running"}`: a channel that should be on is down.
- `onyx_dependency_up == 0`: the database or Redis does not answer.
- `onyx_queue_jobs{state="failed"}` rising, or `waiting` growing with no `active`.
- `onyx_disk_free_bytes` low for the `processing` or `live` folder.

Routes are the pattern of the route, such as `/v1/assets/:id`, and never the address that was asked for: playback addresses carry a token, and a series for each would never stop growing. A request that matched no route is counted as `unmatched`.

## What it does not report

- Other queues than processing: there are none. Jobs for webhooks, recordings and the like are kept in the database and are not counted here.
- Edges and P2P. Those figures stay in the panel.
- Per-process request figures. `onyx_http_*` is the API process only, because the others serve no requests.
- Alerts. Use the alert rules of your monitoring system on these numbers.
