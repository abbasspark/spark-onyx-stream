// SPDX-License-Identifier: AGPL-3.0-only
import { encodeForm } from './stripe.form.js';

describe('encodeForm', () => {
  it('names nested values with brackets, as Stripe reads them', () => {
    const form = encodeForm({
      mode: 'subscription',
      allow_promotion_codes: true,
      line_items: [
        { quantity: 1, price_data: { unit_amount: 799, recurring: { interval: 'month' } } },
      ],
      metadata: { viewerId: 'v-1' },
    });
    expect(Object.fromEntries(new URLSearchParams(form))).toEqual({
      mode: 'subscription',
      allow_promotion_codes: 'true',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][unit_amount]': '799',
      'line_items[0][price_data][recurring][interval]': 'month',
      'metadata[viewerId]': 'v-1',
    });
  });

  it('leaves out what is not set', () => {
    expect(encodeForm({ a: null, b: undefined, c: { d: undefined }, e: 0, f: false })).toBe(
      'e=0&f=false',
    );
  });

  it('escapes names and values', () => {
    expect(encodeForm({ success_url: 'https://a.example/x?s={ID}&b=1', name: 'Ünï & co' })).toBe(
      'success_url=https%3A%2F%2Fa.example%2Fx%3Fs%3D%7BID%7D%26b%3D1&name=%C3%9Cn%C3%AF%20%26%20co',
    );
  });
});
