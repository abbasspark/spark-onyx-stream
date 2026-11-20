# @onyx/admin

The admin panel: a single-page app built with Vite and React.

## What it does today

- **Dashboard:** titles, videos, processing, storage, uploads per day, recent failures and activity
- **Titles:** movies and series as a wall of posters or a table, with search, filters and sorting
- **Title editor:** texts, categories, videos, artwork, seasons and episodes, and a checklist that says what is missing before publishing
- **Categories:** create, edit, delete and reorder
- **Library:** posters in a grid or a table, search, status filter, sorting, bulk actions, drag-and-drop upload
- **Uploads:** several files at once, resumable, shown in a tray on every page
- **Video page:** preview player, details, and tabs for qualities, subtitles, pictures, jobs, activity and source
- **Live updates:** progress and changes appear as they happen, also from other admins and tabs
- **Jobs:** progress of every processing step, cancel and retry
- **Settings:** encoding profiles, storage pools, admins, API keys, audit log
- **Everywhere:** light and dark theme, command palette (`Ctrl K` or `Cmd K`), keyboard navigation

Buttons that change something are shown only to roles that may use them.

## Built with

Vite, React, React Router, TanStack Query, Tailwind CSS 4 and Radix primitives. The components in `src/components/ui` follow the shadcn/ui approach: their code lives in this repository. See decision D-021.

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
  api/             API client, endpoint functions and response types
  auth/            Session state and token storage
  components/      App shell, command palette, player, upload tray, job table, title editor parts
  components/ui/   The component library: buttons, forms, dialogs, tables, badges
  lib/             Formatting, navigation and other helpers
  live/            Connection to the server's event stream
  pages/           One file per page
  theme/           Light, dark and system theme
  uploads/         Upload manager shared by all pages
  styles.css       Design tokens and Tailwind setup
```

## Checks

```bash
pnpm --filter @onyx/admin typecheck
pnpm --filter @onyx/admin lint
pnpm --filter @onyx/admin test
```
