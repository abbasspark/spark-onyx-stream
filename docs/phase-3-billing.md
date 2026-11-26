# Phase 3: Billing

Billing lets an operator earn from a site: viewers subscribe to a plan, and a subscription opens the titles that need one.

It is built in steps. This document describes what is built so far: plans, subscriptions, paid titles, access granted by an admin, paying online with Stripe, the books (every payment, and what the payments add up to), packages, through which plans differ in what they open, and renting or buying a single title.

## Model

- **Plan**: what a viewer subscribes to. A name, a description, a list of what is included, a price per month, per year, or both, and a number of free trial days.
- **Subscription**: a viewer's hold on a plan over a stretch of time. It has a state, a source (granted by an admin, or paid online), a start and an end. A viewer has at most one that is running. Ended ones stay as the history of the account.
- **Access of a title**: `FREE` or `PAID`, set per title. An episode is as open as its series.
- **Payment**: money a viewer paid for a subscription. Collected by Stripe, or received by the operator and written down by an admin. It stays in the books when the account is deleted, with the email address it was paid under.

- **Package**: a group of paid titles that plans open together, such as Kids or Sports. A title can be in several. Live channels are sorted into the same packages (see `phase-4-live.md`).
- **Purchase**: a viewer's right to watch one title, rented for a time or bought for good, whatever plan they have or have not.

A plan opens every paid title, or the packages chosen for it.

## Who may watch

| Title  | Rule                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FREE` | As open as the installation: everyone, or signed-in viewers (`CATALOG_PLAYBACK`)                                                                     |
| `PAID` | A signed-in viewer with a running subscription whose plan opens the title, or who rented or bought it, whatever `CATALOG_PLAYBACK` says except `off` |

- **A subscription is running** while its state is trialing, active or "payment failed" and its end has not passed. The end time decides to the moment. The stored state is tidied up afterwards by the scheduler and never decides access.
- **A failed payment does not lock a viewer out at once.** Access continues while the payment is retried.
- **Trailers stay open,** also of paid titles. They are the invitation.
- **Browsing is never limited.** Everyone sees every published title. Paid ones are marked.
- **A plan opens a paid title** when the plan opens everything, or when the title is in one of the plan's packages.
- **A paid title in no package is opened only by plans that open everything.** A title that was not sorted yet is never given away by mistake. The panel counts such titles and lists them.
- **A change counts at once:** putting a title into a package, or changing the packages of a plan, changes what its subscribers can watch with the next request.
- **The playback endpoints answer `402`** with the code `subscription_required` to a signed-in viewer without a subscription, with `plan_required` to one whose plan does not open the title, with `purchase_required` for a title that is rented or bought only, and `401` to a visitor.
- With `VIEWER_EMAIL_VERIFICATION=required`, a paid title also needs a confirmed address.

## Packages

Without packages every plan opens every paid title, and nothing has to be set up.

To sell plans that differ in what they open:

1. Create packages on the **Packages** page and put titles into them. A title's packages can also be set in the title itself.
2. On the **Plans** page, set a plan to "Chosen packages" and choose them.
3. Keep at least one plan that opens everything if some paid titles are to stay outside all packages.

- A package that a plan names cannot be deleted. Take it out of the plan first.
- Deleting a package keeps its titles. They lose only that membership.
- A free title can be in a package. It matters once the title needs a subscription.
- A viewer who pays online switches to another plan, or bills the same plan per year instead of per month, from the account page. See [Changing plan](#changing-plan).
- The page of plans tells viewers what each plan opens, by the names of its packages.

## Renting and buying

A paid title can carry a price for renting, a price for buying, or both. A viewer who pays it can watch that title, with or without a subscription.

- **Renting** gives a time to start (`RENTAL_START_DAYS`, 30) and, from the first play, a time to finish (`RENTAL_WATCH_HOURS`, 48). The rental never runs past the day it had to be started by. A rental that ran out can be rented again.
- **Buying** opens the title for as long as it is on the site.
- **A series** is rented or bought as a whole. Its episodes follow it.
- **"Not part of any subscription"** on a title keeps it out of every plan: it is watched by renting or buying only. For a premiere, for example. Such a title needs at least one price.
- **A subscriber whose plan opens a title** watches it through the plan. A rental they also hold is not started by that.
- **Paying** runs through Stripe Checkout as a single payment, and the viewer returns to the page of the title. No further events have to be added to the webhook endpoint.
- **A refund in full takes the title back.** A part of the money returned leaves it with the viewer.
- **An admin can give a title by hand,** rented or bought, as a gift or with an amount that goes into the books, and can take any title back.
- **A viewer who owns a title is not sold it again:** a bought title in no way, a running rental not as another rental. Buying while a rental runs is possible.
- Without Stripe, the page of a title shows the prices and where to ask. Titles are then given by an admin.
- In the books, rentals and purchases are payments of their own kind, beside the subscriptions.

## Coupons

A coupon is a code a viewer enters before paying, for a lower price. Coupons are made in the panel under **Billing → Coupons**.

- **A code takes off a share or a sum:** 1 to 100 percent, or an amount in the currency of the site. A price is never lowered below nothing. A code that would leave less than 50 of the smallest unit to pay is refused for that price, because no card payment can be that small; a code that leaves nothing is fine, and the plan or title is then free.
- **A code is for everything, for plans, or for renting and buying single titles.** A code for plans can be limited to some of them.
- **On a subscription it counts for the first payment, for a number of months, or for every payment.** On a title it counts for that one payment. With a free trial, the code counts from the first payment after the trial.
- **Limits:** a first and a last day, a number of uses in all, once per viewer (the default), and only for viewers who have not paid on the site before.
- **How often a code may be used is counted when the payment page is opened,** not when the payment is made. Between the two, a viewer is at Stripe and nothing here knows how it will end. So a code with a limit can be used a few times beyond it when many people check out in the same minutes, and `oncePerViewer` can be passed by one viewer who opens two payment pages at once. Codes are a discount, not money of their own, so this is left as it is.
- **A coupon can be switched off.** It then takes no more uses and keeps its history. One that was never used can be deleted; one that was used stays in the books.
- **Where a coupon stands** is worked out from all of this: active, scheduled, ended, used up, or switched off.
- **The viewer enters the code on the page of plans or on the page of a title.** The page asks the site what the code does and shows the new price before anything is paid: the old price struck through, and what a subscription costs once the code has run out. On the page of plans one request answers for every plan and both ways of paying.
- **A code that does not exist, is switched off or has not begun gets one and the same answer,** and a viewer may ask ten times in ten minutes. Codes cannot be found by trying them out.
- **The price is lowered at Stripe.** When a checkout is opened with a code, the site makes sure a coupon with the same terms exists at Stripe and opens the payment page with it. The id of that coupon names the terms, so nothing is stored about it, and a coupon that is changed here gets a new one there. Viewers who subscribed with a code keep the terms they got.
- **A use is written down when the checkout is completed,** from the viewer's return or from Stripe's message, whichever comes first, and once. Opening the payment page is not a use.
- **The record of a use** holds the viewer, what was paid for, the price without the code and what the code took off the first payment. It outlives the account, with the email address as it was.
- **The books hold what was really paid.** Revenue counts payments after the discount.
- **Limits are checked when the payment page is opened.** Two viewers who open it at the same moment for the last use of a code both get it.

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
- **Codes for a reduced price** are made in the panel under Coupons and entered on the website before paying. See [Coupons](#coupons). A checkout that is opened without such a code still shows Stripe's own field, for codes made in Stripe under "Coupons".
- **A plan can say on how many devices its subscribers play at the same time.** See [Stream limits](phase-2-viewers.md#stream-limits).
- **A plan is a product at Stripe** with the plan's name. Prices are sent with each payment, so a change of price here applies to new subscribers at once. Viewers who already subscribed keep paying their old price.
- **An account with a running paid subscription cannot be deleted,** by the viewer or by an admin, because the payments would go on. The subscription is cancelled first.

### Setting it up

1. Create an account at [stripe.com](https://stripe.com). Start in test mode (a "sandbox"): the whole flow works and no money moves.
2. Under Developers, "API keys", copy the **secret key**. It starts with `sk_test_`.
3. Under Developers, "Webhooks", add an endpoint:
   - address: the address of your API followed by `/v1/billing/stripe/webhook`, such as `https://watch.example.com/v1/billing/stripe/webhook`
   - events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `charge.refunded`
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

### Payments and refunds

- **Each paid invoice becomes a payment in the books,** reported by Stripe with `invoice.paid`. The invoice over nothing that starts a free trial is no payment.
- **A refund is made in Stripe,** in full or in part. Stripe reports it with `charge.refunded` and the payment here shows what was returned. A refund does not end the subscription: cancel it as well if the viewer should stop watching.
- **"Import from Stripe"** on the Revenue page reads the paid invoices Stripe has into the books. Use it once after updating from a version without payments, or after the endpoint was unreachable for longer than Stripe retries. It reads up to 2,000 invoices per run and never counts one twice.
- An endpoint set up before payments existed has to get the two events `invoice.paid` and `charge.refunded` added at Stripe.

### Taxes

By default the price of a plan is charged as it is, and taxes are the operator's to handle. With `STRIPE_AUTOMATIC_TAX=true` Stripe Tax works out the tax of each payment from the customer's address. Prices then include the tax. Stripe Tax has to be set up in the Stripe account first and costs extra.

## Revenue

The Revenue page of the admin panel, and `GET /billing/revenue`, add the payments up.

- **Per month:** what was paid, what was returned of it, and the rest, split into collected online and written down by hand. A refund counts against the month of its payment, so the figures of a past month can still change.
- **Months are cut in a time zone.** The panel asks for the one of the browser.
- **By plan,** with the name the plan had when it was paid for.
- **Monthly recurring revenue:** what the subscriptions paid online bring in per month as they stand. A yearly price counts a twelfth. Trials and cancelled subscriptions are left out. Access granted by hand has no price and is not in it.
- **Started and ended:** subscriptions paid online, by month.
- **One currency.** Sums are in `BILLING_CURRENCY`. Payments in another currency, which exist after the setting was changed, are left out of the sums and named.
- **Tax** is shown where Stripe Tax worked it out, and is part of every amount.
- **Export:** the payments as a CSV file with the filters of the list, one line per payment, amounts with a decimal point, times in UTC. Who exported is written to the audit log, because the file holds email addresses.

Money received by hand is written down in a viewer on the Viewers page: an amount, the day, the plan and a note. It can be deleted again when entered by mistake. Granting access and recording a payment are separate: one opens the titles, the other goes into the books.

## Settings

| Setting                 | Default | Meaning                                                                                                                                    |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `BILLING_CURRENCY`      | `EUR`   | Currency of all prices, as three capital letters. Decide before the first plan: prices are stored as numbers and do not convert themselves |
| `RENTAL_START_DAYS`     | `30`    | Days a viewer has to start a rented title                                                                                                  |
| `RENTAL_WATCH_HOURS`    | `48`    | Hours to finish a rented title once it was started                                                                                         |
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

| Method and path                    | Purpose                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /catalog/plans`               | The plans on offer, the currency, and whether one can pay online. Cached like the catalog      |
| `GET /viewer/subscription`         | The signed-in viewer's own subscription, and whether paid titles are open to them              |
| `POST /viewer/checkout`            | Opens Stripe's payment page for a plan and an interval. Answers with the address to go to      |
| `POST /viewer/coupons/check`       | What a code does: to a plan (`planId`, `interval`), a title (`titleId`, `kind`) or all `plans` |
| `POST /viewer/checkout/confirm`    | Called on return from the payment page. Records the subscription or the title at once          |
| `POST /viewer/subscription/change` | Moves the subscription paid online to another plan or interval, now: `{ planId, interval }`    |
| `POST /viewer/billing-portal`      | Opens Stripe's customer portal. Answers with the address to go to                              |
| `POST /billing/stripe/webhook`     | Where Stripe reports to. Trusted by the signature of each message alone                        |
| `GET /viewer/payments`             | The signed-in viewer's own payments, with the address of each invoice                          |
| `POST /viewer/purchases/checkout`  | Opens Stripe's payment page for renting or buying a title: `titleId`, `kind` (`RENT` or `BUY`) |
| `GET /viewer/purchases`            | The viewer's rented and bought titles                                                          |

`POST /viewer/checkout` and `POST /viewer/purchases/checkout` take an optional `code`. A code that cannot be used is answered with `404` and `coupon_unknown`, or with `409` and one of `coupon_ended`, `coupon_used_up`, `coupon_already_used`, `coupon_new_customers`, `coupon_not_for_this` and `coupon_too_much`, each with a sentence for the viewer.

`POST /viewer/checkout` answers `409` with the code `already_subscribed` to a viewer with a running subscription, `503` with `checkout_unavailable` when there is no online payment, and `502` with `payment_provider_error` when Stripe cannot be reached.

`GET /viewer/session` also returns `entitled` and `access`, so a page learns together with who is signed in whether there is a subscription and what it opens: `{ all, packageIds }`, or null, and `purchases`, the titles rented or bought. Titles in the public catalog carry `access` and, when paid, `packageIds`, `rentAmount`, `buyAmount` and `purchaseOnly`. Plans carry `includesAll` and `packages`, and the answer names how long a rental lasts.

### For admins

Permissions `billing:read` and `billing:write`. Owners and admins have them. Editors do not.

| Method and path                                 | Purpose                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /billing`                                  | How billing is set up, and counts for the panel                                              |
| `GET /plans`, `POST /plans`                     | List plans with their subscribers, create one                                                |
| `PATCH /plans/{id}`, `DELETE /plans/{id}`       | Change a plan. Delete one that nobody ever had                                               |
| `PUT /plans/order`                              | Set the order of the page of plans                                                           |
| `GET /packages`, `POST /packages`               | List packages with their titles and plans, create one. Reading needs `catalog:read`          |
| `PATCH /packages/{id}`, `DELETE /packages/{id}` | Rename a package. Delete one that no plan names                                              |
| `PUT /packages/order`                           | Set the order of the packages                                                                |
| `PUT /packages/{id}/titles`                     | Put titles in and take titles out: `add`, `remove`                                           |
| `GET /viewers/{id}/subscriptions`               | A viewer's running subscription and the history                                              |
| `POST /viewers/{id}/subscriptions`              | Grant access                                                                                 |
| `PATCH /subscriptions/{id}`                     | Change granted access                                                                        |
| `POST /subscriptions/{id}/end`                  | End access now. Cancels at Stripe when paid online                                           |
| `POST /subscriptions/{id}/refresh`              | Read a subscription paid online from Stripe again                                            |
| `POST /billing/stripe/check`                    | Ask Stripe which account the key belongs to                                                  |
| `GET /billing/stripe/events`                    | The last messages from Stripe                                                                |
| `GET /billing/revenue`                          | Revenue per month and by plan, and monthly recurring revenue. `months` (1 to 36), `timeZone` |
| `GET /payments`                                 | The payments, newest first. Filters `q`, `source`, `status`, `planId`, `from`, `to`          |
| `GET /payments/export`                          | The same as a CSV file                                                                       |
| `GET /viewers/{id}/payments`                    | What one viewer paid                                                                         |
| `POST /viewers/{id}/payments`                   | Write down money received by hand                                                            |
| `DELETE /payments/{id}`                         | Delete a payment that was written down by hand                                               |
| `POST /billing/stripe/import-payments`          | Read the paid invoices from Stripe into the books                                            |
| `GET /coupons`, `POST /coupons`                 | The coupons, each with its state, its uses and what it took off. Make one                    |
| `GET`, `PATCH`, `DELETE /coupons/{id}`          | One coupon. Change it, or delete it while it was never used                                  |
| `GET /coupons/{id}/redemptions`                 | Who used the code, the latest first, in pages                                                |
| `GET /viewers/{id}/purchases`                   | The titles a viewer rented or bought                                                         |
| `POST /viewers/{id}/purchases`                  | Give a viewer a title by hand: `titleId`, `kind`, optional `amount` and `note`               |
| `POST /purchases/{id}/revoke`                   | Take a title back                                                                            |

A title's access is part of the title: `access`, `packageIds`, `rentAmount`, `buyAmount` and `purchaseOnly` in `PATCH /titles/{id}`, and the filters `access`, `packageId` and `packaged=none` of `GET /titles`. A plan takes `includesAll` and `packageIds`. `GET /viewers` shows each viewer's plan and takes `subscribed=yes` or `no`.

- **A plan that viewers have or had cannot be deleted.** It is part of their history. It can be taken off the offer instead.
- **One plan at a time is the recommended one.**
- **A change of price reaches nobody who already subscribed.** Granted access has no price, and a subscription paid online keeps the price it started with.
- **A subscription paid online is not changed here.** Its plan and its end follow Stripe. An admin can cancel it, which stops the payments at once. Money is returned in Stripe.

## Admin panel

- **Plans** page: figures on subscribers, the plans as cards with prices and what a year saves, creating and editing, ordering, recommending, and taking a plan off the offer.
- **Online payment** on the Plans page: test or live mode, a check of the connection, the webhook address and its events to copy, the last message from Stripe, and the list of recent messages with what went wrong, if anything.
- **Packages** page: the packages as cards with their titles and plans, creating, renaming and ordering, and a dialog to put titles in and take them out with search.
- **Revenue** page: monthly recurring revenue, this month against the last, a chart of the months split into online and by hand, revenue by plan, who started and ended, and every payment with search, filters and export.
- **Viewers** page: the plan next to each viewer, a filter for subscribers, and in a viewer's sheet the subscription with granting, changing and ending, and the history. A subscription paid online shows its next payment, a link to Stripe, and can be refreshed and cancelled. Below it are the titles the viewer rented or bought, with giving one by hand and taking one back, and the viewer's payments, with recording one received by hand.
- **Titles**: a switch "Paid title" in each title with its prices for renting and buying and its packages, a mark in the list, and filters for access and package.

## Viewer website

- **Plans** page, linked in the menu when the site offers plans: the plans side by side, monthly and yearly, with a button to subscribe, or how to ask for access on a site without online payment.
- **After paying** the viewer lands on a page that confirms the subscription and leads back to what they wanted to watch.
- **Paid titles carry a lock** on their poster. The page of a title a viewer cannot watch yet shows the ways to get it: subscribe, rent for a price, buy for a price.
- **The player explains itself:** it asks a visitor to sign in, and a viewer without a subscription to subscribe, each with the way there and back.
- **Account** page: the plan, when it is paid next or until when it runs, a failed payment, the way to Stripe's portal, the titles rented and bought with what is left of each, and the payments with a link to each invoice.

## Changing plan

A viewer with a subscription paid online changes it on the account page: another plan, or the same plan per year instead of per month. It takes effect at once.

- **The difference is paid now.** Stripe credits the time left on the old price, charges the new price for what is left of the period, and bills the balance in one invoice paid with the card on file. A change to a cheaper plan leaves a credit that Stripe takes off the next invoice.
- **If the card cannot pay, nothing changes.** The answer is `402` with the code `payment_failed`, and the viewer stays on the plan they had. They are never left half on one plan and half on the other.
- **Only a subscription paid online that is active or in its trial can be changed.** One an admin granted or a prepaid code gave answers `409` with `no_online_subscription`. One set to end answers `409` with `subscription_ending`: it has to be resumed first. One whose payment failed answers `409` with `payment_failed`: the card has to be put right first.
- **The plan and interval the viewer has already** answer `400`. A plan that is not on offer answers `404`, and one not sold for the interval `400`.
- **A free trial goes on** when a viewer in their trial switches plans. Stripe does not charge for a trial.
- **A code of this site does not apply to a change.** A discount that is already on the subscription stays on it.
- **The change is recorded when it is made,** without waiting for Stripe's own message, and that message arrives afterwards and finds nothing to change. A profile with an age limit cannot change the plan, like everything else that spends the account's money.

## Not built yet

- Emails of this site about payments. Stripe sends receipts and, if turned on there, reminders
- Gift codes that open something without a payment page, and batches of single-use codes
- A code on a payment an admin writes down by hand
- Payment providers other than Stripe

## Prepaid codes

Codes that give days of a plan, made in batches and entered by a viewer on the website, need no online payment at all. See [prepaid-codes.md](prepaid-codes.md).
