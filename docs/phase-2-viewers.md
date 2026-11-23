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

| Name                        | Values                                   | Meaning                                                                                       |
| --------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `VIEWER_REGISTRATION`       | `open` (default), `closed`               | Whether people can create an account themselves. With `closed`, only admins create viewers    |
| `CATALOG_PLAYBACK`          | `open` (default), `viewers`, `off`       | Who may play published titles. `viewers` needs a signed-in viewer                             |
| `VIEWER_EMAIL_VERIFICATION` | `optional` (default), `required`         | Whether a viewer must confirm their email address before they can watch. Needs email to be on |
| `SMTP_URL`                  | empty (default), `smtp://…`, `smtps://…` | The mail server. Empty turns email off                                                        |
| `MAIL_FROM`                 | `Name <address>`                         | Sender of the emails. Needed with `SMTP_URL`                                                  |
| `SITE_URL`                  | `https://host`                           | Address of the viewer website, for the links in emails. Needed with `SMTP_URL`                |
| `SITE_NAME`                 | `Onyx Stream` (default)                  | Name of the site, as emails call it                                                           |

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
- **Profiles are not a lock.** Anyone signed in to the account can choose any profile.

| Method and path              | Purpose                                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| `GET /profiles`              | The profiles, the one in use on this device, the limit, the colours |
| `POST /profiles`             | Add a profile: `{ name, color? }`                                   |
| `PATCH /profiles/{id}`       | Change name or colour                                               |
| `DELETE /profiles/{id}`      | Delete a profile and its watch history                              |
| `POST /profiles/{id}/select` | Use this profile on this device                                     |

All under `/v1/viewer`. `GET /session`, `POST /register` and `POST /login` also return the profile in use as `profile`. The watch history endpoints work on the profile in use.

On the website, signing in to an account with more than one profile asks "Who is watching?". The header shows the profile in use and switches between them, and other open tabs follow. In the panel, a viewer's sheet lists the profiles and says who watched what.

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

## My list

A viewer saves titles to watch later. The list goes with the account, per profile, so it is the same on every device.

- **A list holds titles, not episodes.** A series is saved as a whole.
- **Every title has the button:** on its card, on its page and in the opening of a page. A visitor who presses it is led to sign in and comes back to where they were.
- **The list has a page of its own,** `/my-list`, linked from the account menu, with the last added first. It can also stand as a row on any arranged page: "My list" is a section in the panel's builder, like "Continue watching". The home page that puts itself together shows it after "Continue watching". The row shows only for viewers who saved something.
- **A title that is unpublished stays on the list and is not shown.** It returns by itself when it is published again. A deleted title leaves every list.
- **A list holds 500 titles.** Enough for any person, and an end for a script. The API says so when it is full.
- **Deleting a profile or an account deletes its list.**
- **In the panel,** a viewer's sheet shows what they saved and whether they began it since. Analytics has "Saved to watch later": the titles on the most lists, how many were added lately and how many of those who saved a title have begun it. Much saved and little begun is a title that is wanted and not yet watched. These figures name no viewer, and they do not depend on viewing statistics being on: the list is something the viewer asked the site to keep.

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
- **"Titles in"** in the footer chooses the language names and descriptions are shown in, when at least one visible title is translated. The choice is kept in a cookie for a year and reaches the home page, lists, title pages, collections, people and the search. The site around the titles stays in English. This is the one thing that makes a page differ between two visitors when it leaves the server.

## Not built yet

- Changing the email address by the viewer. An admin can change it
- Emails in other languages, and editing their text in the panel
- Profiles for children that show only what suits them, and a PIN on a profile
- A picture of one's own for a profile
- A "watch next" row that offers the following episode of a series
- Subscriptions and payments
- A limit on devices or on streams at the same time
- Sign-in with Google, Apple or similar
