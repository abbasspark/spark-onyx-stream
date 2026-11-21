# Phase 3: Billing

Billing lets an operator earn from a site: viewers subscribe to a plan, and a subscription opens the titles that need one.

It is built in steps. This document describes what is built so far: plans, subscriptions, paid titles, access granted by an admin, and paying online with Stripe.

## Model

- **Plan**: what a viewer subscribes to. A name, a description, a list of what is included, a price per month, per year, or both, and a number of free trial days.
- **Subscription**: a viewer's hold on a plan over a stretch of time. It has a state, a source (granted by an admin, or paid online), a start and an end. A viewer has at most one that is running. Ended ones stay as the history of the account.
- **Access of a title**: `FREE` or `PAID`, set per title. An episode is as open as its series.

In this version every plan opens all paid titles. Plans differ in price and in how they are paid.

## Who may watch

| Title  | Rule                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| `FREE` | As open as the installation: everyone, or signed-in viewers (`CATALOG_PLAYBACK`)              |
| `PAID` | A signed-in viewer with a running subscription, whatever `CATALOG_PLAYBACK` says except `off` |

- **A subscription is running** while its state is trialing, active or "payment failed" and its end has not passed. The end time decides to the moment. The stored state is tidied up afterwards by the scheduler and never decides access.
- **A failed payment does not lock a viewer out at once.** Access continues while the payment is retried.
- **Trailers stay open,** also of paid titles. They are the invitation.
- **Browsing is never limited.** Everyone sees every published title. Paid ones are marked.
- **The playback endpoints answer `402`** with the code `subscription_required` to a signed-in viewer without a subscription, and `401` to a visitor.
- With `VIEWER_EMAIL_VERIFICATION=required`, a paid title also needs a confirmed address.

## Access granted by an admin

For viewers who pay the operator directly, in cash or by bank transfer, through a reseller, or who get access as a gift.

- **Grant**: a plan, an end (a date, or none) and a note only admins see.
- **Change**: the plan, the end or the note of access that is running.
- **End now**: stops access at once. It can be granted again at any time.
- A viewer who already has a running subscription cannot be granted a second one.
- Everything is written to the audit log with who did it.

## Paying online with Stripe

With a Stripe key set, the page of plans gets a button per plan. Without one, nothing of this section is active and access is granted by hand.

### How a payment runs

1. The viewer chooses a plan, monthly or yearly. The site asks Stripe for a payment page (a Checkout Session) and sends the viewer there. Card details are entered at Stripe and never reach this application.
2. Stripe sends the viewer back to `/plans/thanks`. The site asks Stripe about that payment and records the subscription at once.
3. Stripe also reports the payment to the webhook endpoint. Whichever of the two arrives first records the subscription. The other finds it done.
4. From then on Stripe reports every change to the endpoint: a renewal, a cancellation, a failed payment, the end.

- **Stripe is the authority for a subscription paid online.** A message from Stripe is only a hint that something changed: the subscription is read from Stripe again and recorded as it is now. So a message that arrives twice, late or out of order does no harm.
- **Every message is checked** against the signing secret of the endpoint, and refused when it is older than five minutes. Each is handled once.
- **A lost message is caught.** The scheduler asks Stripe about every subscription whose renewal or end is overdue by an hour.
- **A renewing subscription lets its viewer watch three days past the next payment date.** Nobody who paid is locked out because a message was late. A subscription that ended at Stripe ends here at once.
- **A failed payment** leaves access open while Stripe tries again, and closes it when Stripe gives up. How often and how long Stripe tries is set in Stripe under Billing, "Revenue recovery".
- **A cancelled subscription** runs until the end of what was paid.
- **The free trial of a plan is given once per viewer,** on the first subscription paid online.
- **A viewer manages the subscription in Stripe's customer portal,** opened from the account page: the card, the invoices, cancelling and resuming.
- **Codes for a reduced price** made in Stripe under "Coupons" can be entered on the payment page.
- **A plan is a product at Stripe** with the plan's name. Prices are sent with each payment, so a change of price here applies to new subscribers at once. Viewers who already subscribed keep paying their old price.
- **An account with a running paid subscription cannot be deleted,** by the viewer or by an admin, because the payments would go on. The subscription is cancelled first.

### Setting it up

1. Create an account at [stripe.com](https://stripe.com). Start in test mode (a "sandbox"): the whole flow works and no money moves.
2. Under Developers, "API keys", copy the **secret key**. It starts with `sk_test_`.
3. Under Developers, "Webhooks", add an endpoint:
   - address: the address of your API followed by `/v1/billing/stripe/webhook`, such as `https://watch.example.com/v1/billing/stripe/webhook`
   - events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`
   - copy its **signing secret**. It starts with `whsec_`.
4. Under Settings, "Billing", "Customer portal", activate the portal. Allow customers to update payment methods, see invoices and cancel subscriptions. Leave "switch plans" off: this version does not follow a change of plan made there.
5. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `SITE_URL`, and restart.
6. In the admin panel, open **Plans** and press "Check connection".

The admin panel shows the address and the events of step 3 to copy.

To go live, repeat steps 2 and 3 in live mode and replace both values. Customers and subscriptions made in test mode stay in test mode: viewers who subscribed while testing lose that access within the hour and can subscribe for real.

### Testing on your own computer

Stripe cannot reach `localhost`. The [Stripe CLI](https://docs.stripe.com/stripe-cli) passes the messages on:

```sh
stripe login
stripe listen --forward-to localhost:3000/v1/billing/stripe/webhook
```

It prints a signing secret (`whsec_...`). Use that one as `STRIPE_WEBHOOK_SECRET` while testing this way. Pay with the card number `4242 4242 4242 4242`, any date in the future and any three digits. `4000 0000 0000 0341` is a card that is accepted and then fails when charged, for trying a failed renewal.

### Taxes

By default the price of a plan is charged as it is, and taxes are the operator's to handle. With `STRIPE_AUTOMATIC_TAX=true` Stripe Tax works out the tax of each payment from the customer's address. Prices then include the tax. Stripe Tax has to be set up in the Stripe account first and costs extra.

## Settings

| Setting                 | Default | Meaning                                                                                                                                    |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `BILLING_CURRENCY`      | `EUR`   | Currency of all prices, as three capital letters. Decide before the first plan: prices are stored as numbers and do not convert themselves |
| `BILLING_CONTACT_URL`   | empty   | Where viewers ask for a subscription while there is no online payment: a web address or `mailto:` address                                  |
| `STRIPE_SECRET_KEY`     | empty   | Secret key of the Stripe account (`sk_test_...`, `sk_live_...`, or a restricted key). Empty means no online payment                        |
| `STRIPE_WEBHOOK_SECRET` | empty   | Signing secret of the webhook endpoint at Stripe (`whsec_...`). Required with the key                                                      |
| `STRIPE_AUTOMATIC_TAX`  | `false` | Lets Stripe Tax work out the tax. Prices then include it                                                                                   |
| `SITE_URL`              | empty   | Address of the viewer website. Required with the key: viewers return there after paying                                                    |

Prices are stored in the smallest unit of the currency: 799 is 7.99 EUR, and 980 is 980 JPY. This is also how Stripe counts.

A restricted key needs write access to Customers, Products, Checkout Sessions, Customer portal and Subscriptions.

## API

All under `/v1`.

### For everyone

| Method and path                 | Purpose                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /catalog/plans`            | The plans on offer, the currency, and whether one can pay online. Cached like the catalog |
| `GET /viewer/subscription`      | The signed-in viewer's own subscription, and whether paid titles are open to them         |
| `POST /viewer/checkout`         | Opens Stripe's payment page for a plan and an interval. Answers with the address to go to |
| `POST /viewer/checkout/confirm` | Called on return from the payment page. Records the subscription at once                  |
| `POST /viewer/billing-portal`   | Opens Stripe's customer portal. Answers with the address to go to                         |
| `POST /billing/stripe/webhook`  | Where Stripe reports to. Trusted by the signature of each message alone                   |

`POST /viewer/checkout` answers `409` with the code `already_subscribed` to a viewer with a running subscription, `503` with `checkout_unavailable` when there is no online payment, and `502` with `payment_provider_error` when Stripe cannot be reached.

`GET /viewer/session` also returns `entitled`, so a page learns it together with who is signed in. Titles in the public catalog carry `access`.

### For admins

Permissions `billing:read` and `billing:write`. Owners and admins have them. Editors do not.

| Method and path                           | Purpose                                            |
| ----------------------------------------- | -------------------------------------------------- |
| `GET /billing`                            | How billing is set up, and counts for the panel    |
| `GET /plans`, `POST /plans`               | List plans with their subscribers, create one      |
| `PATCH /plans/{id}`, `DELETE /plans/{id}` | Change a plan. Delete one that nobody ever had     |
| `PUT /plans/order`                        | Set the order of the page of plans                 |
| `GET /viewers/{id}/subscriptions`         | A viewer's running subscription and the history    |
| `POST /viewers/{id}/subscriptions`        | Grant access                                       |
| `PATCH /subscriptions/{id}`               | Change granted access                              |
| `POST /subscriptions/{id}/end`            | End access now. Cancels at Stripe when paid online |
| `POST /subscriptions/{id}/refresh`        | Read a subscription paid online from Stripe again  |
| `POST /billing/stripe/check`              | Ask Stripe which account the key belongs to        |
| `GET /billing/stripe/events`              | The last messages from Stripe                      |

A title's access is part of the title: `access` in `PATCH /titles/{id}`, and a filter of `GET /titles`. `GET /viewers` shows each viewer's plan and takes `subscribed=yes` or `no`.

- **A plan that viewers have or had cannot be deleted.** It is part of their history. It can be taken off the offer instead.
- **One plan at a time is the recommended one.**
- **A change of price reaches nobody who already subscribed.** Granted access has no price, and a subscription paid online keeps the price it started with.
- **A subscription paid online is not changed here.** Its plan and its end follow Stripe. An admin can cancel it, which stops the payments at once. Money is returned in Stripe.

## Admin panel

- **Plans** page: figures on subscribers, the plans as cards with prices and what a year saves, creating and editing, ordering, recommending, and taking a plan off the offer.
- **Online payment** on the Plans page: test or live mode, a check of the connection, the webhook address and its events to copy, the last message from Stripe, and the list of recent messages with what went wrong, if anything.
- **Viewers** page: the plan next to each viewer, a filter for subscribers, and in a viewer's sheet the subscription with granting, changing and ending, and the history. A subscription paid online shows its next payment, a link to Stripe, and can be refreshed and cancelled.
- **Titles**: a switch "Needs a subscription" in each title, a mark in the list, and a filter.

## Viewer website

- **Plans** page, linked in the menu when the site offers plans: the plans side by side, monthly and yearly, with a button to subscribe, or how to ask for access on a site without online payment.
- **After paying** the viewer lands on a page that confirms the subscription and leads back to what they wanted to watch.
- **Paid titles carry a lock** on their poster. Their main button reads "Subscribe to watch" for a viewer without a subscription.
- **The player explains itself:** it asks a visitor to sign in, and a viewer without a subscription to subscribe, each with the way there and back.
- **Account** page: the plan, when it is paid next or until when it runs, a failed payment, and the way to Stripe's portal.

## Not built yet

- Changing from one plan to another while subscribed
- Emails of this site about payments. Stripe sends receipts and, if turned on there, reminders
- Gift codes. Codes for a reduced price work through Stripe's coupons
- Payment providers other than Stripe
- Plans that open only part of the catalog
- Renting or buying a single title
- Reports on revenue
- A limit on how many devices play at the same time
