# Phase 3: Billing

Billing lets an operator earn from a site: viewers subscribe to a plan, and a subscription opens the titles that need one.

It is built in steps. This document describes what is built so far: plans, subscriptions, paid titles, and access granted by an admin. Paying online comes next and plugs into the same model.

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

## Settings

| Setting               | Default | Meaning                                                                                                                                    |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `BILLING_CURRENCY`    | `EUR`   | Currency of all prices, as three capital letters. Decide before the first plan: prices are stored as numbers and do not convert themselves |
| `BILLING_CONTACT_URL` | empty   | Where viewers ask for a subscription while there is no online payment: a web address or `mailto:` address                                  |

Prices are stored in the smallest unit of the currency: 799 is 7.99 EUR, and 980 is 980 JPY.

## API

All under `/v1`.

### For everyone

| Method and path            | Purpose                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /catalog/plans`       | The plans on offer, the currency, and whether one can pay online. Cached like the catalog |
| `GET /viewer/subscription` | The signed-in viewer's own subscription, and whether paid titles are open to them         |

`GET /viewer/session` also returns `entitled`, so a page learns it together with who is signed in. Titles in the public catalog carry `access`.

### For admins

Permissions `billing:read` and `billing:write`. Owners and admins have them. Editors do not.

| Method and path                           | Purpose                                         |
| ----------------------------------------- | ----------------------------------------------- |
| `GET /billing`                            | How billing is set up, and counts for the panel |
| `GET /plans`, `POST /plans`               | List plans with their subscribers, create one   |
| `PATCH /plans/{id}`, `DELETE /plans/{id}` | Change a plan. Delete one that nobody ever had  |
| `PUT /plans/order`                        | Set the order of the page of plans              |
| `GET /viewers/{id}/subscriptions`         | A viewer's running subscription and the history |
| `POST /viewers/{id}/subscriptions`        | Grant access                                    |
| `PATCH /subscriptions/{id}`               | Change granted access                           |
| `POST /subscriptions/{id}/end`            | End access now                                  |

A title's access is part of the title: `access` in `PATCH /titles/{id}`, and a filter of `GET /titles`. `GET /viewers` shows each viewer's plan and takes `subscribed=yes` or `no`.

- **A plan that viewers have or had cannot be deleted.** It is part of their history. It can be taken off the offer instead.
- **One plan at a time is the recommended one.**
- **A change of price reaches nobody who already subscribed** in this version: granted access has no price.

## Admin panel

- **Plans** page: figures on subscribers, the plans as cards with prices and what a year saves, creating and editing, ordering, recommending, and taking a plan off the offer.
- **Viewers** page: the plan next to each viewer, a filter for subscribers, and in a viewer's sheet the subscription with granting, changing and ending, and the history.
- **Titles**: a switch "Needs a subscription" in each title, a mark in the list, and a filter.

## Viewer website

- **Plans** page, linked in the menu when the site offers plans: the plans side by side, monthly and yearly, and how to subscribe.
- **Paid titles carry a lock** on their poster. Their main button reads "Subscribe to watch" for a viewer without a subscription.
- **The player explains itself:** it asks a visitor to sign in, and a viewer without a subscription to subscribe, each with the way there and back.
- **Account** page: the plan and until when it runs.

## Not built yet

- Paying online with Stripe: checkout, renewal, cancelling, failed payments, invoices
- Coupons and gift codes
- Plans that open only part of the catalog
- Renting or buying a single title
- Reports on revenue
- A limit on how many devices play at the same time
