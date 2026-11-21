# Private messaging

Signed-in customers, photographers and videographers can message each other one-to-one. Conversations persist, update live, and can be blocked or reported.

## What it does

- **Message button** on every other profile (creator and customer). It appears only for a signed-in viewer, is hidden on their own profile and while sign-in is being checked, and is disabled with a neutral explanation when messaging is unavailable.
- **Conversation creation.** Opening a profile's Message button finds an existing conversation, or opens a composer. The conversation is created in the same transaction as its first message, so an empty thread is never stored.
- **Inbox** at `/messages`. Two panels on desktop. On a phone, the list comes first and a thread opens full screen with a Back button. Previews, timestamps, unread counts, loading, empty and error states.
- **Thread** with date separators, incoming and outgoing bubbles, load-older paging that keeps the reader's place, a "New messages" button when scrolled up, a profile link, and a Block/Unblock/Report menu.
- **Composer.** Multiline, 5,000-character limit with a counter from 4,000, Enter sends, Shift+Enter adds a line, Enter during input-method composition is ignored, explicit Send button.
- **Live updates.** New messages, unread counts, block changes and in-app notices arrive without a refresh.

## How it fits the existing app

- **Accounts and sessions.** Messaging uses the existing `users` and `sessions` tables and the `ps_session` cookie. Signing in replaces any session already on the browser.
- **Storage.** Six tables, created on startup: `dm_conversations`, `dm_messages`, `dm_reads`, `user_blocks`, `message_reports`, `moderators`. The project chat table `messages` is unchanged.
- **Server.** `server/domain/messaging.ts` holds the rules and queries. `server/routes/messages.ts` holds the HTTP routes and the stream. `server/messaging/` holds the stream registry, the rate limits and the origin check.
- **Client.** `src/lib/messaging/` holds the API wrapper, the store and the hooks. `src/components/messages/` holds the UI. `src/pages/Messages.tsx` is the page.
- **Shared rules.** `shared/messaging.ts` has the limits, the body checks and the wire types, used by both sides.

## Privacy and access control

- **Participants only.** Every query includes the viewer as one of the two participants. A conversation the viewer is not in returns the same 404 as a missing one, so outsiders cannot tell whether it exists.
- **Sender identity comes from the session.** Request schemas are strict, so a body with `senderId`, `conversationId` or any other extra field is rejected with a 400. The sender cannot be changed.
- **Unauthenticated requests** receive 401 with no data, for the API, the stream and the pages.
- **Idempotency.** Each message carries a client-generated id, unique per sender. A repeated send returns the saved message and is never stored twice.
- **One conversation per pair.** The database enforces `UNIQUE (user_low_id, user_high_id)` with `user_low_id < user_high_id`. Simultaneous first messages from both sides land in the same conversation.
- **Streams.** `GET /api/messages/stream` is authenticated by the session cookie. It carries no conversation id, and each event is sent only to the two participants. It ends on logout, when the session is replaced, or when the session expires (checked every 30 seconds).
- **Origin checks.** A request whose `Origin` header does not match its host is refused unless the origin is listed in `ALLOWED_ORIGINS`.
- **Caching.** Every `/api` response carries `Cache-Control: private, no-store`.
- **Logging.** The API does not log message text, cookies or session tokens.
- **Rendering.** Message text is displayed as text. Only `http` and `https` addresses become links, with `rel="noopener noreferrer nofollow"`.
- **Encryption.** Messages are **not** end-to-end encrypted. The server and its database can read them. Moderators can read the copies stored with a report.

## Blocking and reporting

- **Block** stops messages in both directions, including a first message to someone who has never been messaged. History stays visible. The blocked person sees a neutral "Messaging is not available in this conversation." The blocker sees "You blocked …" and can unblock.
- **Report** asks for a reason, up to 10 loaded messages, and an optional explanation of up to 1,000 characters. The server stores a copy of the selected messages in `message_reports`. The reported person is not notified.
- **Moderation queue.** `GET /api/moderation/reports` returns open reports with the stored copies. It is limited to reviewer accounts. Reviewer access is granted only by the start-up bootstrap (`STAFF_BOOTSTRAP_EMAIL`, with `STAFF_BOOTSTRAP_PASSWORD` matching the account), never by signing in. Everyone else gets 403. Addresses in `MODERATOR_EMAILS` cannot be used for self-service sign-up. There is no moderation screen yet.

## Limits

| Setting | Default | Meaning |
| --- | --- | --- |
| `MESSAGE_SEND_LIMIT_PER_MINUTE` | 30 | Sends per account per minute. Over the limit: 429 with a retry time. |
| `CONVERSATION_START_LIMIT_PER_HOUR` | 10 | New conversations per account per hour. |
| `MESSAGE_STREAMS_PER_USER` | 5 | Open live streams per account. |

Fixed rules: 5,000 characters per message (counted as characters, so an emoji is one), request bodies up to 32 KB, control characters rejected, empty and whitespace-only messages rejected.

These limits are kept in memory, so they apply per server process. See the remaining work below.

## Real-time and reconnects

- The browser uses `EventSource` (server-sent events) for `/api/messages/stream`.
- After a reconnect, the inbox reloads and each open thread fetches messages after its newest known sequence number. Messages are merged by id, so nothing appears twice.
- A read position moves forward only when the newest message is on screen, the window is visible, and the list is still at the bottom when the save is made. Otherwise the message stays unread, and the "New messages" button appears.

## Delivery states

- **Sending**: the request is pending.
- **Sent**: the server has stored the message. The live confirmation replaces the pending bubble.
- **Not sent**: the message is kept on screen. Retry sends it again with the same client id, so it cannot be stored twice.

"Delivered" and "Read" are not shown. The server records read positions, but the sender does not see them yet.

## Sign-out, expiry and account switching

- Logout destroys the session on the server and closes its streams. The client clears conversations, previews, unread counts and pending messages.
- Other tabs of the same browser are told over a `BroadcastChannel` and re-check the session. A tab showing a protected page leaves it.
- The page is checked again when the tab returns to the foreground or is restored from the back-forward cache.
- Signing in as another account destroys the previous session on that browser and closes its streams. The client store is reset, so the new account sees only its own conversations.

## Configuration

Set in `.env` (see `.env.example`):

- `MESSAGE_SEND_LIMIT_PER_MINUTE`, `CONVERSATION_START_LIMIT_PER_HOUR`, `MESSAGE_STREAMS_PER_USER`: limits above.
- `MODERATOR_EMAILS`: comma-separated reviewer addresses that self-service sign-up refuses (`EMAIL_RESERVED`).
- `STAFF_BOOTSTRAP_EMAIL` and `STAFF_BOOTSTRAP_PASSWORD`: create or confirm the reviewer account at start-up. Access is granted only when the password matches; otherwise the server logs a warning and grants nothing.
- `REPORTS_PER_HOUR`: reports one account can file per hour (default 10).
- `ALLOWED_ORIGINS`: comma-separated extra origins that may use messaging, for example `https://photoshoot.example`. Requests from the same host are always allowed.
- `COOKIE_SECURE=true`: set when serving over HTTPS, so the session cookie is only sent over HTTPS.

## Tests

- `npm run test:unit`: the message rules and the rate limiter (`shared/tests/messaging.test.ts`), and an integration suite over real HTTP (`server/tests/messaging.test.ts`). The integration suite covers signed-out access, outsiders, sender identity, idempotency, validation, blocking, read positions, reports and moderation, stream routing, logout and sign-in replacing sessions, origins, paging, and rate limits.
- `npm run test:e2e`: `tests/e2e/messaging.spec.ts`. It covers the Message button and its visibility, first messages and real-time delivery, simultaneous creation, outsiders by URL, API and stream, impersonation and invalid input, script-like text, retries and double-clicks, keyboard behaviour, the character counter, unread counts and scroll position, blocking, reporting, sign-out with other tabs, account switching, the inbox's failed-request state, and the phone layout with the keyboard open.

## Remaining before live use

- **Several servers.** Rate limits and open streams live in one process's memory. Move them to shared storage, and publish events through a shared bus, before running more than one instance.
- **HTTPS.** Serve over HTTPS, set `COOKIE_SECURE=true`, and list any separate front-end origin in `ALLOWED_ORIGINS`.
- **Avatars.** Profile photo upload does not exist yet, so the inbox shows initials. The data model returns `avatarUrl: null`, and the UI already renders an image when one is provided.
- **Moderation screen.** Reports are reachable through the API for moderators only. A review screen and a way to act on reports are not built.
- **Global message sequence (open, Low).** `dm_messages.seq` is one AUTOINCREMENT counter shared by every conversation, and the API returns `seq` and `latestSeq`. A person can see gaps between the numbers in their own conversations and infer how much messaging happens elsewhere on the platform. Fix by giving each conversation its own sequence.
- **Retention and deletion.** There is no account deletion or message retention policy. Decide both before live use.
- **Encryption at rest and backups.** The database is a local SQLite file. Protect it with the hosting provider's disk encryption and backup controls. Database access policies are not applicable here, since the database is not exposed to clients. The server applies the rules instead.
- **Push notifications.** Notices appear only while the site is open.
