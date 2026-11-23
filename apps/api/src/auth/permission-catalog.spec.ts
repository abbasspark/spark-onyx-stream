// SPDX-License-Identifier: AGPL-3.0-only
import { catalogPermissions, PERMISSION_CATALOG } from './permission-catalog.js';
import { PERMISSIONS } from './permissions.js';

describe('PERMISSION_CATALOG', () => {
  it('names every permission exactly once', () => {
    expect([...catalogPermissions()].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('gives every area a label and a sentence for each permission', () => {
    for (const section of PERMISSION_CATALOG) {
      for (const area of section.areas) {
        expect(area.label.length).toBeGreaterThan(2);
        expect(area.read.description).toMatch(/^See /);
        if (area.write) {
          expect(area.write.description.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it('marks the areas that lead to more than their own page', () => {
    const sensitive = PERMISSION_CATALOG.flatMap((section) => section.areas)
      .filter((area) => area.sensitive)
      .map((area) => area.key);
    expect(sensitive).toEqual(['billing', 'settings', 'admins', 'api-keys']);
  });
});
