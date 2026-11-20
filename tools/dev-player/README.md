# Development player

A single page for trying the API by hand: sign in, upload a video, watch it being processed and play the result.

```bash
pnpm dev:player
```

Then open http://localhost:5173.

## Requirements

- The API is running (`pnpm dev`), with the `worker` role enabled, which is the default.
- `CORS_ORIGINS` in `.env` contains `http://localhost:5173`.
- An admin exists. Create the first one as described in the [API README](../../apps/api/README.md#first-run).

## Notes

- The page loads hls.js and tus-js-client from the jsDelivr CDN, so it needs an internet connection.
- It is a development tool, not part of the product. The admin panel replaces it.
- The session token is kept in the browser's session storage and is gone when the tab is closed.
