# Releasing

A release is a version tag. Pushing it builds the images and publishes them to the GitHub container registry, then creates a GitHub release with notes made from the merged pull requests. The workflow is `.github/workflows/release.yml`.

## Making a release

1. Set the new version in `apps/api/package.json`, and in the root `package.json` to match. The API reports this version in its metrics, in diagnostics and to apps.
2. Merge that change to `main` and wait for CI to pass on it.
3. Tag the commit and push the tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

The workflow refuses a tag that differs from `apps/api/package.json`, so a mismatch stops before anything is published. A tag with a suffix, such as `v0.2.0-rc.1`, is a pre-release: its images get only that tag, never `latest`, and the release is marked as a pre-release.

## What is published

Five images, under `ghcr.io/<owner>/`:

| Image                          | Built from                       |
| ------------------------------ | -------------------------------- |
| `spark-onyx-stream-api`        | `Dockerfile`, target `api`       |
| `spark-onyx-stream-web`        | `Dockerfile`, target `web`       |
| `spark-onyx-stream-gateway`    | `Dockerfile`, target `gateway`   |
| `spark-onyx-stream-tracker`    | `services/tracker/Dockerfile`    |
| `spark-onyx-stream-edge-agent` | `services/edge-agent/Dockerfile` |

Each gets the exact version (`0.2.0`), the minor (`0.2`) and `latest`. From version 1 on it also gets the major (`1`). Images are built for `linux/amd64`.

## Before the first release

- **Make the packages public.** GitHub creates a new package as private. After the first release, open each package under the profile's Packages, choose Package settings, and change its visibility to public. Until then nobody else can pull the images.
- **Check a pull request first.** A pull request that changes the workflow builds all five images without publishing, which is how a change to it is tested.

## What it does not do yet

- The installer and the Compose files still build the images on the server. Pulling these images instead would make an install faster and make an update a download, and is a separate change.
- No `linux/arm64` images. A Node build under emulation is slow, so it wants runners of its own.
- The images are not signed.
