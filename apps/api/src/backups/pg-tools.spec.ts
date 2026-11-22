// SPDX-License-Identifier: AGPL-3.0-only
import {
  connectionEnv,
  countArchiveEntries,
  majorOf,
  parseToolVersion,
  toolProblem,
} from './pg-tools.js';

describe('connectionEnv', () => {
  it('takes the address apart', () => {
    expect(connectionEnv('postgresql://onyx:s3cret@db.internal:5433/onyx?schema=public')).toEqual({
      PGHOST: 'db.internal',
      PGPORT: '5433',
      PGDATABASE: 'onyx',
      PGUSER: 'onyx',
      PGPASSWORD: 's3cret',
      PGCONNECT_TIMEOUT: '15',
    });
  });

  it('reads a password with special characters', () => {
    expect(connectionEnv('postgres://u:p%40ss%2Fw%3Ard@h/d').PGPASSWORD).toBe('p@ss/w:rd');
  });

  it('uses the usual port and passes the TLS mode on', () => {
    const env = connectionEnv('postgresql://u@h/d?sslmode=require');
    expect(env.PGPORT).toBe('5432');
    expect(env.PGSSLMODE).toBe('require');
    expect(env.PGPASSWORD).toBeUndefined();
  });

  it('knows a unix socket', () => {
    expect(connectionEnv('postgresql://u@localhost/d?host=/var/run/postgresql').PGHOST).toBe(
      '/var/run/postgresql',
    );
  });
});

describe('tool versions', () => {
  it('reads what the tools print', () => {
    expect(parseToolVersion('pg_dump (PostgreSQL) 17.2 (Debian 17.2-1.pgdg120+1)\n')).toBe('17.2');
    expect(parseToolVersion('pg_restore (PostgreSQL) 16.15')).toBe('16.15');
    expect(parseToolVersion('command not found')).toBeNull();
  });

  it('knows the major version', () => {
    expect(majorOf('17.2')).toBe(17);
    expect(majorOf(170002)).toBe(17);
  });

  it('finds what stands in the way', () => {
    expect(toolProblem('17.2', '17.4')).toBeNull();
    expect(toolProblem('18.0', '17.4')).toBeNull();
    expect(toolProblem('17.2', null)).toBeNull();
    expect(toolProblem(null, '17.4')).toMatch(/not installed/);
    expect(toolProblem('16.15', '17.4')).toMatch(/older than the database server \(17\.4\)/);
  });
});

describe('countArchiveEntries', () => {
  it('counts the objects and not the comments', () => {
    const listing = [
      ';',
      '; Archive created at 2026-11-22 03:00:00 UTC',
      ';     dbname: onyx',
      '; Selected TOC Entries:',
      ';',
      '921; 1247 16400 TYPE public AdminRole onyx',
      '245; 1259 16500 TABLE public admin_users onyx',
      '3900; 0 16500 TABLE DATA public admin_users onyx',
      '',
    ].join('\n');
    expect(countArchiveEntries(listing)).toBe(3);
    expect(countArchiveEntries('')).toBe(0);
  });
});
