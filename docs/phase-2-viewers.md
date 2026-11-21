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

Email address, name, a hash of the password, whether the account is disabled, and when they last signed in. For each device they are signed in on: a hash of its token, what the browser or app called itself, and the address it signed in from.

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

| Name                  | Values                             | Meaning                                                                                    |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `VIEWER_REGISTRATION` | `open` (default), `closed`         | Whether people can create an account themselves. With `closed`, only admins create viewers |
| `CATALOG_PLAYBACK`    | `open` (default), `viewers`, `off` | Who may play published titles. `viewers` needs a signed-in viewer                          |

A private service for invited people is `VIEWER_REGISTRATION=closed` with `CATALOG_PLAYBACK=viewers`.

## API for viewers

All under `/v1/viewer`. Answers about a person are never cached.

| Method and path                          | Purpose                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `GET /config`                            | What is open: registration and playback. No sign-in needed                |
| `POST /register`                         | Create an account and sign in                                             |
| `POST /login`, `POST /logout`            | Sign in and out                                                           |
| `GET /session`                           | Who is signed in, or nobody. Never an error, so a page can ask every time |
| `GET /me`, `PATCH /me`                   | The viewer's own account, and changing the name                           |
| `POST /password`                         | Change the password                                                       |
| `GET /sessions`, `DELETE /sessions/{id}` | The devices signed in, and signing one out                                |
| `POST /delete`                           | Delete the own account. Asks for the password again                       |

Playback (`POST /v1/catalog/…/playback`) answers 401 with "Sign in to watch" when `CATALOG_PLAYBACK=viewers` and no viewer is signed in.

## API for admins

All under `/v1/viewers`, with the permissions `viewers:read` and `viewers:write`. Owners and admins have them. Editors do not, because this is personal data.

| Method and path               | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `GET /viewers`                | Page of viewers. Filters: status, search by name or email. Sorts |
| `GET /viewers/{id}`           | One viewer with the devices they are signed in on                |
| `POST /viewers`               | Create a viewer                                                  |
| `PATCH /viewers/{id}`         | Change name, email or status. Disabling signs the viewer out     |
| `POST /viewers/{id}/password` | Set a new password and sign the viewer out everywhere            |
| `POST /viewers/{id}/sign-out` | Sign the viewer out everywhere                                   |
| `DELETE /viewers/{id}`        | Delete the viewer                                                |

## Admin panel

The **Viewers** page shows what the installation lets the public do (sign-up and playback), then the viewers with search, a status filter and sorting. For each viewer: details and devices, edit, a new password that can be made up and copied, sign out everywhere, disable or enable, delete. The dashboard shows the number of viewers.

## Viewer website

- **Sign in** and **Create an account** pages. After either, the viewer lands where they came from, for example on the video they wanted to watch. Only addresses on the site itself are accepted as the way back.
- **Account** page: name, password, the devices signed in with a way to sign each out, sign out, and deleting the account.
- The header shows "Sign in" to a visitor and the account to a viewer.
- **When playback needs a viewer**, the player page asks to sign in instead of showing an error.
- Pages stay the same for everyone when they leave the server. Who is signed in is asked by the browser, so pages can still be shared and cached.
- With sign-up closed, the sign-up page says so and the buttons that lead to it are not shown.

## Not built yet

- Email: verifying an address, and "forgot password". Until then an admin sets a new password
- Watch history and "continue watching" that follow a viewer between devices
- Subscriptions and payments
- A limit on devices or on streams at the same time
- Sign-in with Google, Apple or similar
