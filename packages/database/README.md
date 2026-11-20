# @onyx/database

Prisma schema, migrations and the database client for PostgreSQL.

## Commands

Run from the repository root:

| Command            | What it does                                                                        |
| ------------------ | ----------------------------------------------------------------------------------- |
| `pnpm db:generate` | Generates the Prisma client into `src/generated` and compiles the package to `dist` |
| `pnpm db:validate` | Checks the schema                                                                   |
| `pnpm db:migrate`  | Creates and applies a migration in development                                      |
| `pnpm db:studio`   | Opens Prisma Studio                                                                 |

## Usage

```ts
import { createPrismaClient } from '@onyx/database';

const prisma = createPrismaClient();
const assets = await prisma.asset.findMany({ where: { status: 'READY' } });
```

## Conventions

- Primary keys are UUID v7, so they sort by creation time.
- Table names are snake_case plurals, set with `@@map`.
- File paths are stored relative to the storage pool root, never as absolute paths.
- Sizes in bytes use `BigInt`.
- The generated client and `dist` are not committed. Run `pnpm db:generate` after install and after every schema change.
- The package is an ES module. Other packages import the compiled output in `dist`.
