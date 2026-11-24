# Prepaid codes

A prepaid code gives days of a plan. The operator makes codes in batches and sells or gives them away outside the platform: printed on cards, through resellers, by message. A viewer enters a code and the plan starts, or runs longer. No card and no online payment is needed, so this works where Stripe does not, and next to Stripe where it does.

This page says how codes are made, what happens when one is entered, what clients do, and what is kept.

## A batch

Codes are made in batches, in the panel under Billing → Prepaid codes. A batch has:

| Field    | Meaning                                                                       |
| -------- | ----------------------------------------------------------------------------- |
| Name     | For admins, to tell batches apart: where or how the codes are sold            |
| Plan     | What a viewer can watch with a code. Fixed once the batch exists              |
| Days     | How many days one code gives, 1 to 3,650. Fixed once the batch exists         |
| Codes    | How many codes, 1 to 5,000. For more, make another batch                      |
| Last day | Until when the codes can be entered. Empty: at any time. Can be changed later |
| Note     | Optional, for admins                                                          |

The codes are downloaded as a CSV file, for a spreadsheet, a card printer or a reseller: `code, plan, days, valid_until, state, used_at`. The file can be downloaded again at any time, as the unused codes or as all codes with their state. One code can also be shown in full in the panel.

A batch can be:

- **Withdrawn.** Its unused codes stop working, for good. Codes that were used keep what they gave. One single code can be withdrawn the same way, such as for a lost card.
- **Deleted,** while none of its codes was used. A batch with used codes stays, as the record of where subscriptions came from.
- **Given more time,** by changing its last day. Codes of a batch whose last day has passed work again.

A plan that codes were made for cannot be deleted. Stop offering it instead.

## What a code looks like

`K7MQ-2XWD-9RTB-4HNC`: sixteen characters in four groups, from thirty letters and digits. The ones that look alike (0, 1, O, I, L, U) are in no code. Capitals, spaces and dashes do not matter when a code is entered.

There are some 4 × 10²³ possible codes, and an account may try twenty in a quarter of an hour.

## Entering a code

A viewer signs in and enters the code at `/redeem` on the website. The site first says what the code gives, and uses it only when the viewer says yes. A link can carry the code, for a QR code on a card: `/redeem?code=K7MQ-2XWD-9RTB-4HNC`. Such a code is looked up at once and still waits for the yes.

What happens depends on what the account has:

| The account has                 | What the code does                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| No running subscription         | The plan starts now and runs for the days of the code                                     |
| The same plan, with an end date | The days are added to the end. This holds for access an admin granted too                 |
| A subscription paid online      | Refused: it renews by itself. The viewer cancels it first, or uses the code after it ends |
| The same plan without an end    | Refused: there is nothing to add to                                                       |
| Another plan                    | Refused, with the day the other plan ends                                                 |

**A refused code stays good.** It is spent only in the moment the plan starts or grows, and both happen together or not at all. Two codes entered in the same moment add up. One code entered by two accounts in the same moment goes to one of them.

A subscription from a code has the source `PREPAID`. It ends on its day by itself and nothing renews it. An admin can change its end or end it, like access granted by hand. Starting one sends the `subscription.started` webhook. `subscription.ended` is sent when an admin ends it. Running out on its day sends nothing, as with access granted by hand: the `endsAt` of the start, and of every later look at the viewer, says when that is.

A profile with an age limit cannot enter a code, as it cannot change anything else about the account.

## For clients

Both calls need a signed-in viewer.

| Call                           | What it does                                  |
| ------------------------------ | --------------------------------------------- |
| `POST /v1/viewer/codes/check`  | Says what the code would do, without using it |
| `POST /v1/viewer/codes/redeem` | Uses the code                                 |

Both take `{ "code": "…" }` and answer with the plan, the days, `action` (`start` or `extend`) and `endsAt`, the day the account can watch until. Show the answer of `check` and ask before calling `redeem`.

A refusal carries a `code` to act on, next to a sentence for the viewer:

| `code`                | Status | Meaning                                                   |
| --------------------- | ------ | --------------------------------------------------------- |
| `not_found`           | 404    | No such code. The answer is the same for every wrong code |
| `used`                | 409    | It was used already                                       |
| `expired`             | 410    | The last day of its batch has passed                      |
| `withdrawn`           | 410    | It was taken back                                         |
| `subscription_renews` | 409    | A subscription paid online is running                     |
| `subscription_open`   | 409    | The account's access has no end                           |
| `other_plan`          | 409    | Another plan is running                                   |

`GET /v1/viewer/subscription` says `prepaid: true` for a subscription that came from a code, so a client can offer "add days with a code".

On a television, typing sixteen characters with a remote is slow. Show the address `/redeem` and let the viewer enter the code on a phone: the account is the same.

## In the panel

- **The page** shows how many codes are left, how many were used, how many viewers watch through a code right now, and the codes used per day over the last thirty days.
- **A batch** shows its codes with their state and who used each one. Codes are hidden but for their last four characters.
- **Look up a code:** a viewer reads a code out, and the admin sees whether it is good, which batch it is from, and who used it when.
- **A viewer's page** marks a subscription that came from a code, with the end of the code and the name of its batch in the note.

Making batches, downloading codes, showing a code in full and withdrawing are written to the audit log. The log names a shown code by its last four characters. These need the permission to change billing. Reading the page and looking a code up need the permission to read it.

## What is kept

A code is kept twice, and never as it is:

- **As a hash,** by which it is found when a viewer enters it.
- **Encrypted with the master key,** so that a batch can be downloaded again.

Whoever reads the database alone, or a backup without the master key, has no code. Next to it are the last four characters, when it was used, by which account, and the subscription it started or extended. When an account is deleted, its codes stay used and forget whose they were.

## Limits

- Codes are not money in the books: the platform does not know what a code was sold for, and Revenue does not count them.
- A code is for one plan. It does not move a viewer from one plan to another.
- A code cannot be given back once used. An admin can end the subscription, and that is all.
- There is no printing of cards. The CSV file is what a printer or a reseller takes.
