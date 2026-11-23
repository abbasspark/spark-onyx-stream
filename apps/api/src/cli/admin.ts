// SPDX-License-Identifier: AGPL-3.0-only
//
// The tool for admins who are locked out, for the command line. In an
// installation with Docker Compose:
//
//   docker compose run --rm api node dist/cli/admin.js two-factor-off owner@example.com
import { runAdminCli } from '../auth/admin-cli.js';
import { loadEnvFile } from '../config/load-env-file.js';

loadEnvFile();
process.exitCode = await runAdminCli(process.argv.slice(2), {
  env: process.env,
  out: (line) => void process.stdout.write(`${line}\n`),
});
