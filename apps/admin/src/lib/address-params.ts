// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/** Values to set in the address. Null or an empty text removes the parameter. */
export type ParamChanges = Record<string, string | null>;

/** Applies changes to a query string and returns the new one, without the "?". */
export function mergeParams(search: string, changes: ParamChanges): string {
  const next = new URLSearchParams(search);
  for (const [key, value] of Object.entries(changes)) {
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }
  return next.toString();
}

/**
 * The parameters of the page address, with a function that changes some of them.
 *
 * The function always starts from the address as it is at that moment. A change
 * made a little later, such as a search that waits until typing stops, can
 * therefore never bring back a filter that was cleared in the meantime.
 */
export function useAddressParams(): [URLSearchParams, (changes: ParamChanges) => void] {
  const [params, setParams] = useSearchParams();
  const change = useCallback(
    (changes: ParamChanges) =>
      setParams(mergeParams(window.location.search, changes), { replace: true }),
    [setParams],
  );
  return [params, change];
}
