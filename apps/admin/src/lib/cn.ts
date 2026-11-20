// SPDX-License-Identifier: AGPL-3.0-only
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and lets a later Tailwind class win over an earlier one for the same property. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
