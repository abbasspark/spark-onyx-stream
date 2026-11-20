# @onyx/admin

The admin panel: a single-page app built with Vite and React.

## What it does today

- First-run setup and sign-in
- Library: list, search and filter assets
- Upload: several files at once, resumable, continuing while you move around the panel
- Asset page: preview player with quality choice, details, rename, process again, delete
- Jobs: progress of every processing job, cancel and retry
- Encoding profiles: create, edit, delete and choose the default
- Storage: add a folder or an S3-compatible bucket, set a limit, test the connection
- Admins: add people, change roles, set a password, deactivate
- API keys: create with chosen permissions and expiry, revoke
- Audit log: who changed what, with filters
- My account: change your own password

Buttons that change something are shown only to roles that may use them.

## Run it

```bash
pnpm dev          # from the repository root: the API on http://localhost:3000
pnpm dev:admin    # the panel on http://localhost:5174
```

The development server passes every request under `/v1` on to the API, so the panel and the API share one origin and `CORS_ORIGINS` does not need an entry for the panel.

| Variable       | Used by         | Meaning                                                                             |
| -------------- | --------------- | ----------------------------------------------------------------------------------- |
| `ONYX_API_URL` | `vite` (dev)    | Where the development server sends `/v1`. Default `http://localhost:3000`.          |
| `VITE_API_URL` | the built panel | Origin of the API when it is not the panel's own origin. Leave empty in most cases. |

## Build

```bash
pnpm --filter @onyx/admin build
```

The result in `dist/` is static files. Serve them with any web server that answers unknown paths with `index.html` and passes `/v1` on to the API.

## Layout

```
src/
  api/          API client, endpoint functions and response types
  auth/         Session state and token storage
  components/   Layout, player, job table and small building blocks
  lib/          Formatting helpers
  pages/        One file per page
  uploads/      Upload manager shared by all pages
```

## Checks

```bash
pnpm --filter @onyx/admin typecheck
pnpm --filter @onyx/admin lint
pnpm --filter @onyx/admin test
```
