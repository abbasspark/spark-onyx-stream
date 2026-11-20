// SPDX-License-Identifier: AGPL-3.0-only
import { describeAction, subjectOf } from './audit';

describe('audit helpers', () => {
  it('describes known actions and passes unknown ones through', () => {
    expect(describeAction('asset.delete')).toBe('Deleted a video');
    expect(describeAction('something.new')).toBe('something.new');
  });

  it('finds the name an entry is about', () => {
    expect(subjectOf({ title: 'Film', previousStatus: 'READY' })).toBe('Film');
    expect(subjectOf({ name: 'Website import' })).toBe('Website import');
    expect(subjectOf({ bytes: 12 })).toBeNull();
    expect(subjectOf(null)).toBeNull();
    expect(subjectOf('text')).toBeNull();
  });
});
