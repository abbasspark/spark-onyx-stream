# @onyx/api

NestJS application. One codebase, started in different roles through `APP_ROLE`:

| Role        | Responsibility                                                  |
| ----------- | --------------------------------------------------------------- |
| `api`       | REST API, admin panel backend, playback authorization, webhooks |
| `worker`    | Runs processing jobs with FFmpeg                                |
| `live`      | Supervises live channels                                        |
| `scheduler` | Periodic tasks                                                  |

Not scaffolded yet. See [docs/phase-1-media-engine.md](../../docs/phase-1-media-engine.md).
