// SPDX-License-Identifier: AGPL-3.0-only
import { createPrismaClient, type PrismaClient } from '@onyx/database';

export interface AdminCliIo {
  env: NodeJS.ProcessEnv;
  out: (line: string) => void;
  /** For tests: the database to work on. */
  prisma?: PrismaClient;
}

const USAGE = [
  'Usage:',
  '  admin list                      The admins, with whether each uses two-factor sign-in',
  '  admin two-factor-off <email>    Take two-factor sign-in off an admin who is locked out',
  '',
  'It works on the database directly and needs DATABASE_URL, not a running application.',
  'Whoever can run it can already read and change the database: it opens nothing new.',
];

/**
 * The way back in for an admin nobody else can help: the only owner, without
 * their phone and without their recovery codes.
 *
 * @returns The exit code: 0 when it did what was asked.
 */
export async function runAdminCli(args: string[], io: AdminCliIo): Promise<number> {
  const [command, ...rest] = args;
  if (command !== 'list' && command !== 'two-factor-off') {
    USAGE.forEach(io.out);
    return command === undefined || command === 'help' ? 0 : 2;
  }
  const prisma = io.prisma ?? createPrismaClient(io.env.DATABASE_URL);
  try {
    if (command === 'list') {
      const admins = await prisma.adminUser.findMany({ orderBy: { email: 'asc' } });
      for (const admin of admins) {
        io.out(
          [
            admin.email,
            admin.role,
            admin.isActive ? 'active' : 'deactivated',
            admin.totpEnabledAt ? 'two-factor on' : 'two-factor off',
          ].join('  '),
        );
      }
      return 0;
    }
    const email = rest[0]?.trim().toLowerCase();
    if (!email) {
      io.out('Say whose: admin two-factor-off <email>');
      return 2;
    }
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin) {
      io.out(`There is no admin with the address ${email}. "admin list" shows them.`);
      return 1;
    }
    if (!admin.totpEnabledAt && !admin.totpSecret) {
      io.out(`${email} does not use two-factor sign-in. Nothing was changed.`);
      return 0;
    }
    const now = new Date();
    const [, , sessions] = await prisma.$transaction([
      prisma.adminRecoveryCode.deleteMany({ where: { adminId: admin.id } }),
      prisma.adminUser.update({
        where: { id: admin.id },
        data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
      }),
      // Whoever was signed in with the old factor is signed out with it.
      prisma.adminSession.updateMany({
        where: { adminId: admin.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      prisma.auditLog.create({
        data: {
          action: 'admin.two_factor_reset',
          adminId: null,
          entityType: 'AdminUser',
          entityId: admin.id,
          metadata: { email, by: 'command line' },
        },
      }),
    ]);
    io.out(
      `Two-factor sign-in is off for ${email}, and ${sessions.count} ${sessions.count === 1 ? 'session was' : 'sessions were'} ended.`,
    );
    io.out('They sign in with their password alone and can set it up again under their account.');
    return 0;
  } finally {
    if (!io.prisma) {
      await prisma.$disconnect();
    }
  }
}
