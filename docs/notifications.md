# Notifications

Viewers are told things: that a series they follow has a new episode, that new titles arrived, and whatever the operator writes to them. Every notification is in a list on the account, and is pushed to the devices the viewer allowed.

This page says how it is set up, what clients do, what is sent by itself, and what is kept.

## Two places a notification shows

1. **The list of the account.** Always. The website shows it under the bell, with a mark for what is new. It needs no setup and no permission.
2. **The devices of the account.** A browser that allowed notifications, or an app that registered. The same notification is pushed there.

A viewer with no device still gets everything, in the list.

## Setup

| Way          | What it reaches                  | What it needs                                                                |
| ------------ | -------------------------------- | ---------------------------------------------------------------------------- |
| **Web Push** | Browsers on computers and phones | Nothing. The installation makes its own key pair the first time it is needed |
| **Firebase** | Apps on Android and iOS          | A Firebase project of the operator, and the key of a service account of it   |

- **Browsers** are reached through the push service of their maker (Google, Mozilla, Microsoft, Apple). Messages are encrypted for the one browser they are for (RFC 8291) and signed with the installation's key (VAPID, RFC 8292). The push service carries them and cannot read them.
- **On an iPhone or iPad** a website can only notify once the viewer added it to the home screen. That is Apple's rule.
- **Firebase** is set up in the panel under Notifications → Setup: paste the JSON file from the Firebase console (Project settings → Service accounts → "Generate new private key"). The key is tried at once, kept encrypted with the master key, and never shown again. Firebase delivers to iOS apps through Apple, when the Firebase project has an APNs key.
- **Only push services are ever called.** A browser names the address its messages go to, and a viewer could name any address. The API sends only to the known hosts of the browsers' push services, over https.

| Setting              | Default | Meaning                                                                                                                                                                            |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUSH_CONTACT`       | empty   | How a push service can reach the operator: `mailto:you@your-domain` or an https address. Empty: `SITE_URL` when it is https. Some push services refuse a sender without a real one |
| `PUSH_SERVICE_HOSTS` | empty   | More hosts that may be sent to, separated by commas. For push services not known here, and for tests                                                                               |

`SITE_URL` should be set: the links in pushed notifications are built from it.

## What clients do

`GET /v1/push/config` needs no sign-in and answers the key browsers subscribe with, the Firebase project apps register with (or `null`), and the kinds of notification.

All of the following are for a signed-in viewer.

| Method and path                               | Purpose                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUT /v1/viewer/push/devices`                 | Registers this device. Browser: `provider: "WEB"` with `subscription`. App: `provider: "FCM"` with `token`. Both with `platform` (`web`, `android`, `android-tv`, `ios`) |
| `DELETE /v1/viewer/push/devices/{id}`         | Stops notifications for a device                                                                                                                                         |
| `POST /v1/viewer/push/devices/forget`         | The same by token, for a device that does not know its id                                                                                                                |
| `GET /v1/viewer/notifications`                | The list, the newest first, thirty at a time. `before` pages back. With `unread`                                                                                         |
| `GET /v1/viewer/notifications/unread`         | Only the number not seen yet                                                                                                                                             |
| `POST /v1/viewer/notifications/read`          | Marks as seen: the `ids` named, or all                                                                                                                                   |
| `POST /v1/viewer/notifications/{id}/opened`   | Says the viewer opened one, from the list or by tapping it on a device                                                                                                   |
| `DELETE /v1/viewer/notifications/{id}`        | Takes one out of the list                                                                                                                                                |
| `GET/PATCH /v1/viewer/notifications/settings` | The kinds the account wants: `NEW_EPISODES`, `NEW_TITLES`, `ANNOUNCEMENTS`                                                                                               |

- **An app registers at every start,** and whenever Firebase gives it a new token. Registering the same token again moves the device to whoever is signed in on it now.
- **A device takes notifications for as long as its sign-in holds.** Signing out, on the device or from the list of devices, ends it. Nothing has to be unregistered for that.
- **A device that is gone is forgotten:** when the push service says so, or after ten refusals in a row. An account has twenty devices at most.

### What arrives on a device

The same for every kind of device. A browser gets it as the encrypted JSON of the push event:

```json
{
  "id": "0193…",
  "topic": "NEW_EPISODES",
  "title": "New episode of Signal Fires",
  "body": "S2 E5 · The Trench",
  "image": "https://media.example.com/v1/artwork/….jpg",
  "link": "https://watch.example.com/title/signal-fires",
  "data": { "type": "episode", "slug": "signal-fires", "episodeId": "0192…" }
}
```

An app gets `title`, `body` and `image` as the notification of the Firebase message, and everything else as its `data`, all values as text: `id`, `topic`, `link`, and what `data` holds above. `data.type` is `title`, `episode` or `link` (with `path`), so an app can open its own screen instead of the website.

## What is sent by itself

Switched on and off in the panel under Notifications → Automatic.

| Kind             | Who is told                                                                       | Default |
| ---------------- | --------------------------------------------------------------------------------- | ------- |
| **New episodes** | Accounts that have the series on a list, or watched it within the last six months | on      |
| **New titles**   | Every account                                                                     | off     |

- **It waits two minutes after publishing.** A season published episode by episode is one notification ("3 new episodes of …"), and something published by mistake can be taken back.
- **Three or more new titles at once are one notification** that names the first three.
- **A new series is news about a title,** not about its episodes.
- **Viewers are told when something can be watched,** not when it was published: a title that waits for its start date, or an episode whose video is still processing, is told of when it appears.
- **What was published while a kind was off is never told later.** Nor is what was published before this was installed.
- Each viewer can turn each kind off, for the whole account.
- The words are English and carry the names as the catalog has them.

## Messages of the operator

Written in the panel under Notifications: a headline (80 characters), a text (240), optionally where it leads (a title of the catalog, whose backdrop is the picture, or a path of the website), who it goes to (everyone, subscribers, viewers without a subscription, subscribers of one plan), and when (at once, or at a set time).

- A message is a draft until it is sent. A scheduled one can be held back until its time.
- **"Send a test"** sends it to one viewer by email address, marked as a test and not counted.
- A message leads only to the own website. An address elsewhere is refused.
- Viewers who turned "News from us" off are left out, and so are disabled accounts.
- After sending, the panel shows for how many viewers it was made, on how many accounts a device took it, and how many opened it.
- A sent message cannot be taken back or sent again.

## What is kept

- `push_devices`: one row per device, with the token or the browser's address and keys, what the device says it is, and the sign-in it belongs to.
- `notifications`: one row per notification and account. Deleted after 90 days.
- `push_campaigns`: the messages of the operator.

Pushing is tried up to four times over about half an hour when a push service is down. After that the notification stays in the list only.

## Not built yet

- Notifications per profile: they are for the account, and a profile with an age limit does not see the bell
- Notifications about the account itself: a payment that failed, a subscription about to end
- Reminders for a programme on a live channel
- Texts in the language of each viewer
- Apple's push service without Firebase
- A message that leads outside the website
