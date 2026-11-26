# Monitoring

The API can report numbers about itself to a monitoring system such as Prometheus, at `GET /v1/metrics`, in the Prometheus text format.

## Switching it on

The endpoint is off until a token is set. With no `METRICS_TOKEN` the address answers 404, as if it did not exist. Set one and restart the API:

```bash
openssl rand -hex 32     # put the result in METRICS_TOKEN
```

The token must be at least 32 characters. A request has to send it as `Authorization: Bearer <token>`. An admin session or an API key does not open the endpoint: a scraper is not a person, and a leaked scraper token should open nothing else.

The gateway passes `/v1/` through to the API, so the address is reachable from the internet. The token is what protects it. Keep it secret and rotate it by changing `METRICS_TOKEN`. Calls to the endpoint are limited to 600 in ten minutes per address.

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

| Metric                               | Type      | What it says                                                                  |
| ------------------------------------ | --------- | ----------------------------------------------------------------------------- |
| `onyx_build_info{version}`           | gauge     | The running version. Always 1.                                                |
| `onyx_http_requests_total`           | counter   | Requests answered, by `method`, `route` and `status`.                         |
| `onyx_http_request_duration_seconds` | histogram | How long requests took, by `method` and `route`.                              |
| `onyx_queue_jobs{queue,state}`       | gauge     | Jobs of the processing queue: waiting, active, delayed, failed and completed. |
| `onyx_dependency_up{dependency}`     | gauge     | 1 when the database or Redis answers, 0 when it does not.                     |
| `onyx_process_*`, `onyx_nodejs_*`    | various   | CPU, memory, open files, event loop lag and garbage collection of the API.    |

Routes are the pattern of the route, such as `/v1/assets/:id`, and never the address that was asked for: playback addresses carry a token, and a series for each would never stop growing. A request that matched no route is counted as `unmatched`.

## What it does not report

- Anything about the other processes. Only the API process serves the endpoint, so workers, the live supervisor and the scheduler show up only through the queue figures and `onyx_dependency_up`. The panel's diagnostics page covers them.
- Other queues than processing, viewers watching now, edges and P2P. Those figures stay in the panel.
- Alerts. Use the alert rules of your monitoring system on these numbers.
