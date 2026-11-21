// SPDX-License-Identifier: AGPL-3.0-only

export type FormValue =
  string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

/**
 * Encodes parameters the way Stripe reads them: a form in which nested values
 * are named with brackets, such as "line_items[0][quantity]=1". Values that
 * are null or undefined are left out.
 */
export function encodeForm(params: Record<string, FormValue>): string {
  const pairs: string[] = [];
  const add = (name: string, value: FormValue): void => {
    if (value === null || value === undefined) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => add(`${name}[${index}]`, item));
      return;
    }
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        add(`${name}[${key}]`, item);
      }
      return;
    }
    pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  };
  for (const [key, value] of Object.entries(params)) {
    add(key, value);
  }
  return pairs.join('&');
}
