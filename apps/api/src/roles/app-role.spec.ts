// SPDX-License-Identifier: AGPL-3.0-only
import { parseAppRoles } from './app-role.js';

describe('parseAppRoles', () => {
  it('expands "all" to every role', () => {
    expect(parseAppRoles('all')).toEqual(['api', 'worker', 'live', 'scheduler']);
  });

  it('accepts a single role', () => {
    expect(parseAppRoles('worker')).toEqual(['worker']);
  });

  it('accepts a list, ignoring case, spaces and duplicates', () => {
    expect(parseAppRoles(' Scheduler, api ,api')).toEqual(['api', 'scheduler']);
  });

  it('rejects an empty value', () => {
    expect(() => parseAppRoles(' , ')).toThrow('must not be empty');
  });

  it('rejects unknown roles', () => {
    expect(() => parseAppRoles('api,transcoder')).toThrow('Unknown APP_ROLE value: transcoder');
  });

  it('rejects "all" combined with other roles', () => {
    expect(() => parseAppRoles('all,api')).toThrow('cannot be combined');
  });
});
