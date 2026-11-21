// SPDX-License-Identifier: AGPL-3.0-only

/** The parts of Stripe's objects this application reads. */

export interface StripeAccount {
  id: string;
  email?: string | null;
  country?: string | null;
  default_currency?: string | null;
  charges_enabled?: boolean;
  business_profile?: { name?: string | null } | null;
  settings?: { dashboard?: { display_name?: string | null } | null } | null;
}

export interface StripeCustomer {
  id: string;
  deleted?: boolean;
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  mode: string;
  status: string | null;
  client_reference_id: string | null;
  customer: string | { id: string } | null;
  subscription: string | { id: string } | null;
}

export interface StripePortalSession {
  id: string;
  url: string;
}

export interface StripeSubscriptionItem {
  /** Where the billing period is from API version 2025-03-31 on. */
  current_period_end?: number | null;
  price?: { recurring?: { interval?: string | null } | null } | null;
}

export interface StripeSubscription {
  id: string;
  status: string;
  livemode?: boolean;
  customer: string | { id: string };
  metadata?: Record<string, string> | null;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  canceled_at?: number | null;
  ended_at?: number | null;
  start_date?: number | null;
  created?: number;
  /** Where the billing period was before API version 2025-03-31. */
  current_period_end?: number | null;
  items?: { data?: StripeSubscriptionItem[] | null } | null;
}

export interface StripeEventPayload {
  id: string;
  type: string;
  livemode: boolean;
  created?: number;
  data: { object: Record<string, unknown> };
}

/** Reads the id from a field Stripe fills with an id or with the whole object. */
export function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return typeof value === 'string' ? value : value.id;
}
