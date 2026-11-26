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
  /** "paid", "unpaid" or "no_payment_required". */
  payment_status?: string | null;
  /** The payment of a session that sells something once. */
  payment_intent?: string | { id: string } | null;
  /** What was paid, tax included, in the smallest unit of the currency. */
  amount_total?: number | null;
  currency?: string | null;
  total_details?: { amount_tax?: number | null; amount_discount?: number | null } | null;
  metadata?: Record<string, string> | null;
  created?: number;
}

export interface StripePortalSession {
  id: string;
  url: string;
}

export interface StripeSubscriptionItem {
  id?: string;
  /** Where the billing period is from API version 2025-03-31 on. */
  current_period_end?: number | null;
  price?: {
    unit_amount?: number | null;
    recurring?: { interval?: string | null } | null;
  } | null;
  quantity?: number | null;
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

export interface StripeInvoice {
  id: string;
  /** "draft", "open", "paid", "uncollectible" or "void". */
  status: string | null;
  currency: string;
  /** What was paid, tax included. */
  amount_paid: number;
  customer: string | { id: string } | null;
  number?: string | null;
  hosted_invoice_url?: string | null;
  created?: number;
  status_transitions?: { paid_at?: number | null } | null;
  /** What made the invoice, from API version 2025-03-31 on. */
  parent?: {
    type?: string | null;
    subscription_details?: { subscription?: string | { id: string } | null } | null;
  } | null;
  /** Where the subscription was named before API version 2025-03-31. */
  subscription?: string | { id: string } | null;
  total_taxes?: { amount?: number | null }[] | null;
  /** Where the tax was before API version 2025-03-31. */
  tax?: number | null;
  /** The payments that settled it. Present when asked for. */
  payments?: {
    data?: { payment?: { payment_intent?: string | { id: string } | null } | null }[] | null;
  } | null;
  /** Where the payment was named before API version 2025-03-31. */
  payment_intent?: string | { id: string } | null;
  lines?: { data?: { period?: { start?: number; end?: number } | null }[] | null } | null;
}

export interface StripeList<Item> {
  data: Item[];
  has_more: boolean;
}

/** A charge as a message about a refund describes it. */
export interface StripeCharge {
  id: string;
  amount: number;
  amount_refunded: number;
  refunded?: boolean;
  payment_intent?: string | { id: string } | null;
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
