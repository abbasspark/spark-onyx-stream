# Phase 2: viewers

Viewers are the people who watch, and this part of phase 2 gives them accounts. This document describes accounts in the API, their management in the admin panel, and sign-in on the viewer website.

## Viewers are not admins

A viewer and an admin are different things in every layer:

|                   | Admin                           | Viewer                                         |
| ----------------- | ------------------------------- | ---------------------------------------------- |
| Table             | `admin_users`                   | `viewers`                                      |
| Token starts with | `onyx_sess_`                    | `onyx_view_`                                   |
| Routes            | everything except the two below | `/v1/viewer/…` and playback in `/v1/catalog/…` |
| Created by        | another admin                   | themselves, or an admin                        |

A viewer token opens nothing in the panel, and an admin session is not a viewer. The same email address can be both without the two knowing of each other.

## What is stored about a viewer

Email address, name, a hash of the password, whether the account is disabled, and when they last signed in. For each device they are signed in on: a hash of its token, what the browser or app called itself, and the address it signed in from. The names and colours of their profiles. For each video a profile began: how far it is, whether it was finished, and when it was last watched (see Watch history).

Nothing else. The audit log names a viewer by id and never stores an email address or a name. Deleting a viewer deletes all of it. Sessions that ended more than seven days ago are deleted by the scheduler.

## Sessions

- A sign-in lasts 30 days on a device.
- **The website gets the token as a cookie** (`onyx_viewer`) that scripts cannot read (`HttpOnly`), that other websites cannot use (`SameSite=Lax`) and that is sent only over HTTPS when the site is on HTTPS.
- **Apps get the same token in the answer** and send it in the `Authorization` header.
- A request that changes something and relies on the cookie must come from the site itself. The API compares the `Origin` header with its own address and with `CORS_ORIGINS`.
- Changing the password signs out every other device. Disabling a viewer, or an admin setting a new password, signs out all of them at once.

## Protection of sign-in

- Passwords are hashed like those of admins. Viewers need at least 8 characters.
- After 5 failed sign-ins for one email address from one client address, that pair waits 15 minutes.
- One client address can make 30 sign-in attempts in 5 minutes and create 10 accounts an hour.
- A wrong password, an unknown address and a disabled account get the same answer.
- Sign-up does say when an email address is taken. Without email verification there is no way around that, and the limit on new accounts keeps it from being used to test long lists.

## Settings

| Name                        | Values                                   | Meaning                                                                                                    |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `VIEWER_REGISTRATION`       | `open` (default), `closed`               | Whether people can create an account themselves. With `closed`, only admins create viewers                 |
| `CATALOG_PLAYBACK`          | `open` (default), `viewers`, `off`       | Who may play published titles. `viewers` needs a signed-in viewer                                          |
| `VIEWER_EMAIL_VERIFICATION` | `optional` (default), `required`         | Whether a viewer must confirm their email address before they can watch. Needs email to be on              |
| `SMTP_URL`                  | empty (default), `smtp://…`, `smtps://…` | The mail server. Empty turns email off                                                                     |
| `MAIL_FROM`                 | `Name <address>`                         | Sender of the emails. Needed with `SMTP_URL`                                                               |
| `SITE_URL`                  | `https://host`                           | Address of the viewer website, for the links in emails. Needed with `SMTP_URL`                             |
| `SITE_NAME`                 | `Onyx Stream` (default)                  | Name of the site, until one is set under Branding                                                          |
| `STREAM_LIMIT`              | `0` (default) to `20`                    | On how many devices one account plays at the same time. `0`: no limit. See [Stream limits](#stream-limits) |

A private service for invited people is `VIEWER_REGISTRATION=closed` with `CATALOG_PLAYBACK=viewers`.

## API for viewers

All under `/v1/viewer`. Answers about a person are never cached.

| Method and path                             | Purpose                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /config`                               | What is open: registration and playback. No sign-in needed                                       |
| `POST /register`                            | Create an account and sign in                                                                    |
| `POST /login`, `POST /logout`               | Sign in and out                                                                                  |
| `GET /session`                              | Who is signed in, or nobody. Never an error, so a page can ask every time                        |
| `GET /me`, `PATCH /me`                      | The viewer's own account, and changing the name                                                  |
| `POST /password`                            | Change the password                                                                              |
| `GET /sessions`, `DELETE /sessions/{id}`    | The devices signed in, and signing one out                                                       |
| `POST /delete`                              | Delete the own account. Asks for the password again                                              |
| `POST /password/forgot`                     | Ask for a link to set a new password. The same answer for every address                          |
| `POST /password/reset`                      | Set a new password with the token of the link                                                    |
| `POST /email/verify`                        | Confirm the address with the token of the link. No sign-in needed                                |
| `POST /email/send`                          | Send the link to confirm again                                                                   |
| `GET /watching`                             | "Continue watching": videos begun and not finished, the latest first                             |
| `GET /watching/titles/{slug}`               | Progress in the videos of one title, finished ones included                                      |
| `PUT /watching`                             | Report positions: `{ items: [{ title, episodeId?, position, duration, watchedAt? }] }`, up to 50 |
| `DELETE /watching/{id}`, `DELETE /watching` | Forget one video, or everything                                                                  |
| `GET /streams`                              | What the devices of the account are playing right now, and how many may                          |
| `POST /streams/{id}/beat`                   | The player says it is still playing. `410` tells it to stop                                      |
| `DELETE /streams/{id}`                      | Ends a stream: the player's own on leaving, or another device's to make room                     |
| `GET /list`                                 | "My list": the saved titles as cards, the last added first, and how many more it takes           |
| `GET /list/ids`                             | Only the ids of the saved titles, to mark them on any page                                       |
| `PUT /list/{slug}`, `DELETE /list/{slug}`   | Put a title on the list, or take it off. Both are safe to repeat                                 |
| `DELETE /list`                              | Empty the list                                                                                   |

Playback (`POST /v1/catalog/…/playback`) answers 401 with "Sign in to watch" when `CATALOG_PLAYBACK=viewers` and no viewer is signed in.

## API for admins

All under `/v1/viewers`, with the permissions `viewers:read` and `viewers:write`. Owners and admins have them. Editors do not, because this is personal data.

| Method and path                         | Purpose                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /viewers`                          | Page of viewers. Filters: status, search by name or email. Sorts                       |
| `GET /viewers/{id}`                     | One viewer with the devices they are signed in on                                      |
| `POST /viewers`                         | Create a viewer                                                                        |
| `PATCH /viewers/{id}`                   | Change name, email or status. Disabling signs the viewer out                           |
| `POST /viewers/{id}/password`           | Set a new password and sign the viewer out everywhere                                  |
| `POST /viewers/{id}/sign-out`           | Sign the viewer out everywhere                                                         |
| `DELETE /viewers/{id}`                  | Delete the viewer                                                                      |
| `POST /viewers/{id}/password-email`     | Email the viewer a link to set a new password                                          |
| `POST /viewers/{id}/verification-email` | Email the viewer the link to confirm their address                                     |
| `GET /mail`, `POST /mail/test`          | How email is set up, and sending a test. Permissions `settings:read`, `settings:write` |
| `GET /viewers/{id}/watching`            | What the viewer watched: totals and the latest 25 videos                               |
| `GET /viewers/{id}/streams`             | What the viewer is playing right now, with the limit and where it comes from           |
| `DELETE /viewers/{id}/streams/{stream}` | Stop what one device is playing                                                        |
| `GET /viewers/{id}/list`                | What the viewer saved to watch later: the latest 25, with whether each was begun       |
| `GET /analytics/saved`                  | What stands on lists: totals and the ten titles on the most lists. `days`: 1 to 365    |

## Admin panel

The **Viewers** page shows what the installation lets the public do (sign-up and playback), then the viewers with search, a status filter and sorting. For each viewer: details, devices and what they watched with progress, edit, a new password that can be made up and copied, sign out everywhere, disable or enable, delete. The dashboard shows the number of viewers.

## Email

Email is off until a mail server is set (`SMTP_URL`). With it on, viewers get three emails:

| Email                      | Sent                                                                                | Link works for |
| -------------------------- | ----------------------------------------------------------------------------------- | -------------- |
| Confirm your email address | After sign-up on the website, and when the viewer or an admin asks for it again     | 3 days         |
| Set a new password         | When "Forgot your password?" is used with the address of an account, or by an admin | 1 hour         |
| Your password was changed  | After a new password was set with a link                                            | no link        |

- **A link carries a random token of which only a hash is stored.** It works once, and a newer link of the same kind replaces the older ones.
- **The token rides in the fragment of the address** (`#token=…`), which browsers send to no server and which ends in no access log. The page takes it out of the address bar when it opens.
- **A link stops working when the address of the account changes** or the account is disabled.
- **"Forgot your password?" answers the same for every address,** so it does not tell whether an account exists. Nothing is sent to a disabled account.
- **One viewer gets at most one email of a kind every two minutes,** and one network address can ask for eight emails in fifteen minutes. Nobody can fill a stranger's inbox.
- **Setting a new password signs the viewer out everywhere** and confirms the address, since whoever used the link reads its mail.
- **Emails are sent in the background and tried three times.** Sign-up never waits for the mail server and never fails because of it.
- **A viewer an admin creates counts as confirmed,** unless the admin says otherwise. An address an admin changes counts as not confirmed.
- **With `VIEWER_EMAIL_VERIFICATION=required`,** playback that needs a viewer answers 403 with the code `email_unverified` until the address is confirmed. Browsing, signing in and the account page work as before.
- Emails are plain: text and simple HTML, no pictures, no tracking. Logs never contain an address or the content of an email.

The panel has an **Email** page: how email is set up (never the password of the mail server), what the mail server said to the last email, and a test email that waits for the server's answer. On the **Viewers** page an admin sees which addresses are confirmed, can mark one as confirmed or not, and can send both links.

## Profiles

One account is often used by a household. Profiles give each person their own watch history.

- **Every account has a main profile,** named like the account. It is made when it is first needed, so accounts created before profiles existed, or by an admin, have one too. It can be renamed and cannot be deleted.
- **Up to five profiles.** Each has a name, unique within the account apart from capital letters, and one of eight colours. A new profile gets a colour no other profile of the account has.
- **Which profile is in use is kept per device.** The phone can be on one profile while the television is on another. A device that never chose uses the main profile.
- **Watch history belongs to the profile:** "Continue watching", resume positions and watched marks. Clearing the history clears that of the profile in use.
- **Deleting a profile deletes what it watched.** Devices that used it go back to the main profile and stay signed in.
- **A profile is a lock only with a PIN.** Without one, anyone signed in to the account can choose any profile. See [Parental controls](#parental-controls).

| Method and path              | Purpose                                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| `GET /profiles`              | The profiles, the one in use on this device, the limit, the colours |
| `POST /profiles`             | Add a profile: `{ name, color?, isKids?, maxAge? }`                 |
| `PATCH /profiles/{id}`       | Change name, colour, or what the profile can watch                  |
| `DELETE /profiles/{id}`      | Delete a profile and its watch history                              |
| `POST /profiles/{id}/select` | Use this profile on this device: `{ pin? }`                         |
| `PUT /profiles/{id}/pin`     | Set, change or lift the PIN: `{ pin, password }`, `pin: null` lifts |

All under `/v1/viewer`. `GET /session`, `POST /register` and `POST /login` also return the profile in use as `profile`. The watch history endpoints work on the profile in use.

On the website, signing in to an account with more than one profile asks "Who is watching?". The header shows the profile in use and switches between them, and other open tabs follow. In the panel, a viewer's sheet lists the profiles and says who watched what.

## Languages of a profile

A profile says which language it likes to hear and which it reads subtitles in: `audioLanguage` and `subtitleLanguage`, tags such as `de` or `pt-BR`.

- **A video starts with them when it has them.** `pt` finds a `pt-BR` track, and `pt-PT` finds it when there is no other. Without a fitting track the video plays in its default, and nothing is said.
- **No language for sound** means each video in its own default. **No language for subtitles** means off. Forced subtitles, which only translate what is spoken in another language, show either way.
- **What a viewer picks in the player is remembered,** for the profile, on every device: the player sends it with `PATCH /v1/viewer/preferences`. `GET` reads them. Both work on the profile in use and are open to a profile with an age limit: a child may choose a language.
- They are part of the profile wherever a profile is answered (`/session`, `/login`, `/profiles`), and can be set with the profile.
- A playback answer lists the `audio` and `subtitles` of the video, and the page of a title says the languages it has (`audioLanguages`, `subtitleLanguages`).

## Parental controls

A household shares an account, and not everything in a catalog is for a child. Three things work together: an age on what can be watched, a limit on a profile, and a PIN.

### The age of a title and of a channel

- **Every title and every live channel can say from which age it suits:** a whole number from 0 to 21, `minAge`. This is what limits compare with, because ratings are written differently in every country.
- **The age is read from the rating** when a rating is saved without an age: "FSK 12" is 12, "PG-13" is 13, "TV-MA" is 17, "G" is 0. An import from TMDB does the same. An admin can say the age differently, and it then stays.
- **A rating nobody can read leaves the title without an age.** The panel says so on the title, the list of titles filters by "Not rated", and "Suitable from age" in the actions on many titles sets the age of everything the filters match.
- Titles that existed before got their age from their rating when the installation was updated.

### A limit on a profile

- **A profile can have a limit,** `maxAge`, from 0 to 18. It sees titles and channels that suit up to that age. **What has no age is hidden from it,** because nobody said it suits.
- **A profile for a child,** `isKids`, always has a limit, 12 unless another is chosen. Apps can show it with a simpler look.
- **The main profile has no limit.** It is the way back into the account.
- **The limit is enforced by the API, from the sign-in.** Lists, pages, search, rows, "My list", "Continue watching", the guide and playback are all narrowed, wherever they are asked from. A title above the limit answers as if it did not exist.
- **A profile with a limit watches. It does not manage.** Adding, changing or deleting profiles, changing the name or password of the account, deleting the account, signing other devices out or in, and paying for a plan or a title all answer `403` with `code: "profile_restricted"`.
- Answers narrowed by a sign-in carry `Cache-Control: private, no-store`.

Anyone may also ask the open catalog for less: `?maxAge=12` on any address under `/v1/catalog`. The stricter of this and the profile counts, so it can never widen what a sign-in sees. The website uses it, see below.

### A PIN on a profile

- **Four to six digits,** stored the way passwords are. Choosing a profile that has one needs it.
- **Setting, changing and lifting a PIN asks for the password of the account.** That is also the way out when a PIN is forgotten, and it is why this one action is open to a profile with a limit. An admin can lift a PIN in the panel, which is written to the audit log.
- **Five wrong PINs close the profile for five minutes.** A wrong one answers `403` with `code: "pin_wrong"` and `attemptsLeft`, a missing one `pin_required`, and a closed profile `429` with `pin_locked` and `retryAfterSeconds`.
- **A PIN on the main profile makes a new sign-in choose first.** A device that never chose uses the main profile, so without this a child would only have to sign in again. Such a sign-in answers `chooseProfile: true`, sees only what suits every age and manages nothing, until a profile is chosen.

### On the website

- "Who is watching?" shows a lock on profiles with a PIN and the limit under the name, and asks for the PIN with a way to lift it by password. "Manage profiles" sets what a profile can watch and its PIN.
- A profile with a limit has a shorter menu and no account page.
- **Pages still leave the server the same for everyone with the same limit.** The browser keeps the limit of the profile in use in a cookie, `onyx_audience`, and the server of the website asks the catalog with `?maxAge=`. The cookie only decides which cards are drawn. Removing it shows what a visitor without an account sees, and playing still goes by the sign-in.

### Limits of this

- **Signing out is always possible.** On a site where anyone can watch without an account, a child who signs out sees what every visitor sees. Parental controls protect an account, so they mean most where watching needs one.
- An age is one number for every country. A title rated 12 in one country and 16 in another has the age its admin gave it.
- Episodes have no age of their own. They follow their series.
- There is no time limit per day, and no list of what a child watched other than the watch history of the profile.

## Watch history

Each profile of an account remembers where it is in each video, so "Continue watching" and the resume position are the same on every device.

- **One entry per profile and video.** A video is a movie or an episode.
- **The rules are applied by the API,** so every device agrees: the first 15 seconds do not count as begun, and from 95 % on the video counts as watched. A watched video leaves "Continue watching" and keeps a "Watched" mark. Watching it again brings it back and keeps the mark.
- **The later report wins,** whichever arrives first. A device that was offline hands over its positions with the time they were noted. A time in the future is not believed.
- **Positions for something viewers cannot watch are left out without an error.** While a title is unpublished its entries are hidden, and they return with it.
- **The player reports about every 15 seconds,** and at once when the viewer leaves the video.
- **The viewer can remove a video from the row, or clear everything** on the account page.
- **Admins who may see viewers can see what a viewer watched.** That is personal data: the permission `viewers:read` covers it, and editors do not have it.
- Entries are deleted with the account, the profile, the title or the episode.

On the website the list is also kept in the browser. For a visitor that is the only place. For a viewer it is a copy of the account's list: pages have it at once, and what was noted without a connection is handed over when the next page opens. Signing in hands over what the device kept as a visitor. Signing out removes the copy from the device.

## Stream limits

An account can be limited to a number of devices that play at the same time. Signing in is not limited: only playing is.

- **Where the limit comes from.** `STREAM_LIMIT` sets it for the installation, and `0`, the default, means none. A plan can have its own number, "Devices at the same time", which counts for its subscribers. An admin can set a number for a single viewer, which counts whatever the plan says. With several plans, the most generous counts. A plan without a number follows the installation.
- **What takes a place.** The main video of a movie or an episode, and a live channel, when a signed-in viewer plays it. Trailers and extras take none, and neither does a visitor who is not signed in.
- **A place is taken when playback is asked for.** The answer carries `stream`, with an `id` and how often to report (`beatSeconds`, 30). A device over the limit gets no addresses: the answer is `409` with the code `stream_limit`, the `limit`, and the `streams` that hold the places, each with what it plays and on what kind of device.
- **A device plays one video at a time.** Asking again from the same device, for the same video or another, replaces its place and never takes a second one.
- **The player reports every half minute** to `POST /viewer/streams/{id}/beat`, and gives the place back when it leaves the video, also when the tab is closed. A device that goes silent, because it lost its connection or was switched off, frees its place after 75 seconds.
- **A viewer can stop another device to watch here.** The page that says the account is full lists the devices with a button for each. The device that was stopped is told at its next report (`410`), stops the picture, and says why. The account page shows "Playing now" with the same buttons.
- **Two devices never take the last place together:** places of one account are handed out one after the other.
- **In the panel,** a viewer's sheet shows "Playing now": what each device plays, on what, since when, the limit and where it comes from, and a button to stop a device, which is written to the audit log. The plan editor has "Devices at the same time", and the page of plans on the website says it under each price.
- **What this does not do.** The addresses for playing are signed and stay valid for their time. A player that ignores being told to stop can go on until they run out; the website's player does not. The limit keeps honest households to what they pay for, and makes sharing a password with many people impractical. It is not protection against copying.

## My list

A viewer saves titles to watch later. The list goes with the account, per profile, so it is the same on every device.

- **A list holds titles, not episodes.** A series is saved as a whole.
- **Every title has the button:** on its card, on its page and in the opening of a page. A visitor who presses it is led to sign in and comes back to where they were.
- **The list has a page of its own,** `/my-list`, linked from the account menu, with the last added first. It can also stand as a row on any arranged page: "My list" is a section in the panel's builder, like "Continue watching". The home page that puts itself together shows it after "Continue watching". The row shows only for viewers who saved something.
- **A title that is unpublished stays on the list and is not shown.** It returns by itself when it is published again. A deleted title leaves every list.
- **A list holds 500 titles.** Enough for any person, and an end for a script. The API says so when it is full.
- **Deleting a profile or an account deletes its list.**
- **In the panel,** a viewer's sheet shows what they saved and whether they began it since. Analytics has "Saved to watch later": the titles on the most lists, how many were added lately and how many of those who saved a title have begun it. Much saved and little begun is a title that is wanted and not yet watched. These figures name no viewer, and they do not depend on viewing statistics being on: the list is something the viewer asked the site to keep.

## Devices and signing in with a code

A television has no keyboard, and typing an email address and a password with a remote is where people give up. So a television signs in the other way round: it shows a code, and the viewer confirms it on a phone or a computer where they are signed in already.

### How it goes

1. **The device asks for a code.** `POST /viewer/device-codes` with what the device says about itself. The answer holds a code to show (`CDFG-HJKM`), the address to show beside it, the same address with the code filled in for a QR code, and a secret the device keeps.
2. **The device shows the code** and asks every five seconds whether it was let in: `POST /viewer/device-codes/token` with its secret. The answer is `pending` until the viewer has answered.
3. **The viewer opens `/activate` on the website,** signs in if needed, and enters the code. They see which device asks: its name, what kind it is, and how long ago it asked.
4. **The viewer says yes.** The next time the device asks, the answer is `approved` and holds its token, once. Or the viewer says no, and the device is told `denied`.

A code works for ten minutes and for one answer. After that the device shows a new one.

### Why two secrets

The short code proves nothing by itself. It only lets a signed-in viewer say "this device is mine". The sign-in goes to whoever holds the long secret, which never leaves the device and is stored here as a hash. Someone who reads the code off a screen gains nothing: entering it signs that screen in to their own account.

What remains is tricking a viewer into entering a code that is on somebody else's screen. The page says so in plain words before the viewer answers, and names the device that asks.

- **The alphabet** has no vowels, so a code never spells a word, and none of the characters that are mixed up at a distance: no `0` and `O`, `1` and `I` and `L`, `2` and `Z`, `5` and `S`, `8` and `B`. That leaves 21 characters and about 38 billion codes.
- **Guessing is slowed:** fifteen codes in ten minutes from one address, and a code is only worth guessing while it waits.
- **A device that asks more often than every two seconds** is answered with `429` and the code `slow_down`.

### Devices

An app that signs in says what it is: an id it made up when it was installed, a name to start with, its kind (television, phone, tablet, computer), the app and its version. From then on that installation is a device of the account, and it stays the same device when it is signed out and in again, with the name the viewer gave it.

- A television becomes a device when its code is approved. An app with a keyboard sends the same description with `POST /viewer/login` or `/viewer/register`.
- A browser sends nothing and has no device. It shows in the list of sign-ins by what the browser calls itself, as before.
- The version of the app is kept up to date from the `X-Onyx-Client` header, so the panel shows what each device runs.
- An account remembers thirty devices. Beyond that, the ones not used for the longest and not signed in are forgotten.

A viewer sees their devices under **Account > Devices** on the website, can rename them, and signs out the ones they do not use. An admin sees them in the sheet of a viewer, with the app version, and can remove one, which signs it out.

Devices exist for what comes next: a notification is sent to a device, and a download belongs to one.

### API

| Method and path                            | Purpose                                                              |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `POST /viewer/device-codes`                | Public. A device asks for a code to show                             |
| `POST /viewer/device-codes/token`          | Public. The device asks whether it was let in. Holds the token, once |
| `GET /viewer/device-codes/{code}`          | The device behind a code, for the viewer to look at                  |
| `POST /viewer/device-codes/{code}/approve` | The viewer says yes                                                  |
| `POST /viewer/device-codes/{code}/deny`    | The viewer says no                                                   |
| `GET /viewer/devices`                      | The apps the viewer is, or was, signed in on                         |
| `PATCH /viewer/devices/{id}`               | Give a device another name                                           |
| `DELETE /viewer/devices/{id}`              | Sign a device out and forget it                                      |
| `DELETE /viewers/{id}/devices/{deviceId}`  | For admins with `viewers:write`: the same, written to the audit log  |

For a viewer who forgot a PIN, `DELETE /viewers/{id}/profiles/{profileId}/pin` lifts it, for admins with `viewers:write`. See [Parental controls](#parental-controls).

The address a device shows is the site address of the installation (`SITE_URL`) with `/activate`.

### Limits

- No email is sent when a new device signs in.
- A device that was signed in keeps working after the viewer changes their password only until the sign-ins are ended, which changing a password does everywhere.
- The device is trusted to describe itself. Its name and kind are what it says.

## Viewer website

- **Sign in** and **Create an account** pages. After either, the viewer lands where they came from, for example on the video they wanted to watch. Only addresses on the site itself are accepted as the way back.
- **Account** page: name, password, the devices signed in with a way to sign each out, clearing the watch history, sign out, and deleting the account.
- **"Continue watching" and resuming follow the account.** A series page marks the episodes that were watched, and its main button starts the episode after them.
- The header shows "Sign in" to a visitor and the account to a viewer.
- **When playback needs a viewer**, the player page asks to sign in instead of showing an error. When it needs a confirmed address, it says so and offers to send the email again.
- **Forgot your password?** on the sign-in page, and the pages the emailed links open: set a new password, and confirm the address. The account page shows whether the address is confirmed.
- Pages stay the same for everyone when they leave the server. Who is signed in is asked by the browser, so pages can still be shared and cached.
- With sign-up closed, the sign-up page says so and the buttons that lead to it are not shown.
- **A title's page** shows its genres, rating, release date, countries and studios, who directed and wrote it, its cast with portraits, its extras ("Trailers and more", played like the trailer), and the other titles of its collection.
- **A page per person** (`/person/{slug}`) with their portrait, biography and everything of theirs there is to watch, and **a page per collection** (`/collection/{slug}`) with its titles in order. Both are found by search engines. Somebody with nothing to watch has no page.
- **Browsing by genre**, beside kind, order and category.
- **"Titles in"** in the footer chooses the language names and descriptions are shown in, when at least one visible title is translated. The choice is kept in a cookie for a year and reaches the home page, lists, title pages, collections, people and the search. The site around the titles stays in English. This and the age limit of a profile are the two things that make a page differ between two visitors when it leaves the server.

## Not built yet

- Changing the email address by the viewer. An admin can change it
- Emails in other languages, and editing their text in the panel
- A picture of one's own for a profile
- A "watch next" row that offers the following episode of a series
- Subscriptions and payments
- A limit on devices or on streams at the same time
- Sign-in with Google, Apple or similar
