# Contributing to Spark Onyx Stream

Thank you for considering a contribution.

## Before you start

- **Small fixes** (typos, clear bugs): open a pull request directly.
- **Features or larger changes**: open an issue first and describe what you want to build. This avoids work on something that does not fit the roadmap.
- **Security problems**: never open a public issue. Follow [SECURITY.md](SECURITY.md).

## Contributor License Agreement

Every contributor must agree to the [Contributor License Agreement](CLA.md) before a pull request can be merged. You keep the copyright to your contribution. The agreement lets the project distribute your contribution under the AGPL and under other license terms, including commercial ones.

## Development workflow

1. Fork the repository and create a branch from `main`.
2. Use a descriptive branch name, for example `fix/upload-resume` or `feat/live-dvr`.
3. Keep each pull request focused on one change.
4. Add or update tests for the behavior you change.
5. Make sure linting and tests pass before you open the pull request.
6. Fill in the pull request template.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(live): add DVR window setting per channel
fix(processing): retry probe on truncated uploads
docs: explain edge agent registration
```

## Code style

- TypeScript: strict mode, no `any` without a comment explaining why.
- Go: formatted with `gofmt`, checked with `go vet`.
- New source files start with the license identifier:

```
// SPDX-License-Identifier: AGPL-3.0-only
```

## Code of conduct

By taking part in this project you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
