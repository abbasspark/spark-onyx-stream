// SPDX-License-Identifier: AGPL-3.0-only

/** A PIN is four to six digits. */
export const PIN_MIN = 4;
export const PIN_MAX = 6;

/** The PIN with one more digit, unless it is as long as it may be. */
export function addDigit(pin: string, digit: string): string {
  return /^\d$/.test(digit) && pin.length < PIN_MAX ? pin + digit : pin;
}

/** The PIN without its last digit. */
export function removeDigit(pin: string): string {
  return pin.slice(0, -1);
}

/** Whether the PIN is long enough to be tried. */
export function isCompletePin(pin: string): boolean {
  return pin.length >= PIN_MIN && pin.length <= PIN_MAX && /^\d+$/.test(pin);
}
