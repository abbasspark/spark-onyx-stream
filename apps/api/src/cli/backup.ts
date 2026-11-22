// SPDX-License-Identifier: AGPL-3.0-only
//
// The backup tool for the command line. In an installation with Docker Compose:
//
//   docker compose run --rm api node dist/cli/backup.js verify /path/to/file
import { runBackupCli } from '../backups/backup-cli.js';
import { loadEnvFile } from '../config/load-env-file.js';

loadEnvFile();
process.exitCode = await runBackupCli(process.argv.slice(2), {
  env: process.env,
  out: (line) => void process.stdout.write(`${line}\n`),
});
