# Photo Shoot

Photo Shoot is a Los Angeles-only creative services marketplace. Clients find photographers and videographers, match a whole team to a brief, and everyone agrees on one written agreement before anything is booked. The team then delivers files, revisions and completion are tracked in one workspace, and both sides review each other after the project closes.

This repository is a working demonstration build. It runs end to end on your machine: accounts, discovery, matching, team pricing, agreements, a demonstration payment flow, deliveries, revisions, cancellations, disputes and reviews all persist in SQLite. Payments are simulated unless live Stripe keys are configured. See [docs/PAYMENTS.md](docs/PAYMENTS.md).

## Quick start

Requirements: Node.js 22.13 or newer (developed on Node 24), npm, and Windows, macOS or Linux.

```bash
npm install
npm run build        # type-checks and builds the React app into dist/
npm start            # API and website on http://localhost:4000
```

For development with hot reload, run two terminals:

```bash
npm run dev:server   # API on http://localhost:4000 (tsx watch)
npm run dev          # website on http://localhost:5173, proxies /api to port 4000
```

On first start the server creates `data/photoshoot.db` and seeds demonstration data. Set `RESET_DB=1` to wipe and re-seed, or `SEED_DEMO=0` to start empty. See [.env.example](.env.example).

### Demonstration accounts

All seeded accounts use the password `Demo-Password-2026`. The login page offers one-click fill-in for these.

| Account | Email | Type |
| --- | --- | --- |
| Harbor & Pine Studio | studio@example.com | Customer (business) |
| Northline Realty | realty@example.com | Customer (business) |
| Lena Morales | lena@example.com | Customer (individual) |
| Marisol Vega | marisol@example.com | Creator, photographer |
| Devon Park | devon@example.com | Creator, videographer |

Seeded projects cover each state: an open call, a recruiting team, an agreement awaiting approvals, a booked shoot with a deposit paid, a delivered project, and closed projects with mutual reviews.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks the client and builds `dist/` |
| `npm start` | Runs the Express server, which serves the API and `dist/` |
| `npm run dev` / `npm run dev:server` | Vite dev server and the API with watch mode |
| `npm run typecheck` | Type-checks client and server |
| `npm run test:unit` | Unit and integration tests (`node:test`, 111 tests) |
| `npm run test:e2e` | Builds the app, then runs the Playwright suite (127 tests) on a fresh database |
| `npm test` | Both test suites |
| `npm run lint` | oxlint over the source |

## Requirements coverage

| Brief area | Where it lives |
| --- | --- |
| Mission and purpose | Homepage hero and process, `src/pages/Home.tsx` |
| LA-only service area | `shared/service-area.ts` (City of Los Angeles neighbourhoods). Enforced in the UI selects and in the API, which returns `OUTSIDE_SERVICE_AREA` for anything else |
| Discovery and matching | `/discover` with URL-based filters; `shared/matching.ts` explains each fit and each exclusion |
| Guided matching and teams | `/match` wizard; team builder shows each person's price and the combined total with fees |
| Accounts and dashboards | Separate customer and creator sign-up, role-aware dashboards, profile and settings pages |
| Biographies (350 words) | `shared/biography.ts`; live counter, blocked save and a precise 422 `BIO_TOO_LONG` from the API |
| Creator profiles and tabs | Biography, Photography and Videography tabs, keyboard and touch, empty states; availability calendar |
| Shared agreement | `shared/brief.ts`; every team member and the customer approve the same version; changes list who must approve |
| Project workspace | Overview, Agreement, Team, Messages, Delivery, Payments and Reviews, with a next-step banner |
| Secure booking and payments | Deposit and balance, fees and commission shown before commitment, provider-confirmed status, refunds under the Refund and Cancellation Policy. See [docs/PAYMENTS.md](docs/PAYMENTS.md) |
| Refund and Cancellation Policy and Terms | Both platform protections shown before payment, at sign-up, in invitations and on profiles, with links. The text is in `shared/policy.ts` and shown at `/policies/refund-and-cancellation` and `/terms`. The 72-hour rule is in `shared/cancellation.ts`. Each booking records the versions accepted. Refund requests and reviews are in `server/domain/refunds.ts` |
| Mutual reviews | Only after completion; one review per person per project; labelled demonstration reviews |
| Camera animation | `src/components/home/CameraSequence.tsx` and `src/components/home/camera/`: 120 Blender renders of an original, unbranded compact camera, played back in step with a GSAP ScrollTrigger. It captures a photograph as the visitor scrolls, with a static fallback. See [docs/CAMERA.md](docs/CAMERA.md) and [camera-pipeline/](camera-pipeline/README.md) |
| Creator card previews | `src/components/marketplace/PortfolioPreviewCarousel.tsx`: shadcn Carousel (Embla) showing each creator's first three photos at the top of the card |
| Private messaging | Message button on profiles, inbox and threads at `/messages`, live updates, unread counts, blocking and reporting. Signed-in users only. See [docs/MESSAGING.md](docs/MESSAGING.md) |

## Tools used

The brief asked for four tools. Each one is used for the purpose it was assigned.

**UI UX Pro Max** guided the design system. It was installed for Claude with `npx -p ui-ux-pro-max-cli uipro init --ai claude --offline`, which places the skill in `.claude/skills/ui-ux-pro-max`. The design system was generated with `scripts/uiux_search.py`, a small wrapper that runs the skill's `search.py` under `python -I`. The output is in `design-system/photo-shoot/MASTER.md`. Its scroll-storytelling pattern, reduced-motion guidance, typography direction and pre-delivery checklist were adopted. Its pink and cyan palette was not, because the brief fixes black, cherry red and white. The reasoning is in [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md).

**Blender 5.3** renders the signature camera sequence: 120 frames of an original, unbranded compact camera, built and lit by the scripts in [camera-pipeline/](camera-pipeline/README.md). The website draws the frames on a canvas, and **GSAP with ScrollTrigger** pins the section for 240% of the viewport (170% on phones) and scrubs it by scroll (`scrub: 0.6`, so it moves smoothly forward and backward). It uses `pinSpacing: true`, because the page's `<main>` is a flex container where GSAP would otherwise drop the scroll room the pin needs. `gsap.matchMedia()` selects the full desktop sequence, a lighter phone sequence, or a static finished frame under `prefers-reduced-motion`. The cleanup calls `revert()`. Details, limits and verification are in [docs/CAMERA.md](docs/CAMERA.md).

**shadcn/ui** supplies the controls: Tabs, forms, Dialog, Sheet, the calendar, selects, switches, checkboxes and radios, and the dropdown menu. They are installed into `src/components/ui` with `components.json` (style `radix-nova`, Radix base). `src/index.css` maps shadcn's tokens to the Photo Shoot palette, and the file also holds the touch-target and camera rules. Messaging uses the same primitives: the dropdown menu for conversation options, Dialog for block and report confirmations, radio group and checkboxes for report reasons, and Textarea for the composer. The Message button uses the Button component.

**Playwright** verifies the main journeys in a real browser (`tests/e2e`), on the built app with a fresh database. The web server starts with `npm run test:e2e` on port 4100. For messaging it checks visibility rules, outsiders' access by URL, API and stream, live delivery, retries and double-clicks, blocking, reporting, sign-out across tabs, account switching, and the phone layout with the on-screen keyboard open (`tests/e2e/messaging.spec.ts`).

## Testing

Results from the last full run on this machine:

- `npm run test:unit`: 84 of 84 pass. Unit tests cover the 350-word rule, the fee and deposit arithmetic, the 72-hour guarantee (exact boundary and Los Angeles daylight saving), the camera's frame timing, caption steps and capture-flash rules, the service-area list, matching exclusions and fit reasons, team suggestions, approval rules for changes, the messaging body rules and the rate limiter. Integration tests drive the real Express app on an in-memory database through a booking (invitation, policy acceptance, agreement, approvals, a deposit, a cancellation refund, and the review gate), through refunds (a late cancellation reviewed later, double submission, provider failure and retry, a pending provider refund, quality requests after the deadline, withdrawal, evidence checks and the review queue), and through messaging over real HTTP (access by outsiders, sender identity, retries, validation, blocking, reports, moderation, stream routing, sign-out and session replacement, origins, paging and limits).
- `npm run test:e2e`: 108 of 108 pass. The suite covers:
  - Private messaging (18 tests): the Message button and its visibility rules, first messages that reach the other person live and survive a refresh, simultaneous creation, outsiders by URL, API and stream, impersonation and invalid input, script-like text, double-clicks and retries after a lost reply, keyboard behaviour, the character counter, unread counts and scroll position, blocking, reporting, sign-out across tabs, account switching, the inbox's failed-request state, and the phone layout with the keyboard open.
  - Navigation: header, footer, mobile menu, and each primary call to action reaching a working page.
  - Creator card portfolio previews: the first three photos in saved order, arrows, dots and keyboard arrows, touch swipes and taps on a phone, independent cards, the one-photo and no-photo states, no autoplay, reduced motion, and arrows and swipes that never open the profile.
  - Sign-up: validation messages, duplicate emails, and both account types.
  - Biography: the live counter, a 351-word biography rejected with the save blocked and the text kept, a 350-word biography accepted, persistence and display, and the API limit.
  - Los Angeles restrictions: the neighbourhood lists, the API refusing other locations, and creator coverage.
  - Discovery and matching: filters, fit reasons, empty states with reasons, and a team price with fees.
  - Profile tabs: selected state, keyboard arrows and Home, touch, empty states, and reviews beneath the portfolio.
  - Availability: weekly days and specific dates on the calendar, reflected on the public profile.
  - The full project lifecycle: a two-role team, both invitations accepted, one agreement approved by everyone, a demonstration deposit, delivery, one revision, completion, the balance, payouts scheduled, and mutual reviews that appear on the creator's profile. Reviews stay locked until completion.
  - Refunds and cancellations: the full refund shown on a booked project with its 72-hour deadline, a refund request that is validated, submitted and withdrawn, a cancellation that records a full refund, a quality request from the project lifecycle (withdrawn before payouts), and closed projects that cannot be cancelled, disputed or refunded.
  - Policy and Terms: both guarantees word for word on the policy page, the Terms sections, the footer and sign-up links, and the rule that a deposit or invitation needs the current versions accepted.
  - The camera sequence: the frames advance with the scroll in both directions, the capture flash fires once and fades on its own timer, reduced motion shows the finished frame and the photograph statically, the poster remains if the frames fail, and phones have no horizontal overflow.
  - Layout at 1440, 768 and 390 px: each page renders with no runtime errors, no failed requests and no missing images. Full-page captures are written to `screenshots/` for review.

Layout checks also included a horizontal-overflow scan (`scripts/check-overflow.mjs`) across key pages at 390 and 768 px. It found and fixed a header that overflowed on tablets and a tab row that overlapped content on phones.

Development helpers in `scripts/` (they need the server running on port 4000 with seeded data): `check-overflow.mjs` (overflow scan), `snap-check.mjs` and `snap-app.mjs` (viewport screenshots of key and signed-in screens into `screenshots/review/`).

## Architecture

- **Client** (`src/`): React 19, Vite 8, React Router 7, Tailwind CSS 4, shadcn/ui on Radix, react-hook-form with zod. Routes except the homepage are lazy-loaded.
- **Server** (`server/`): Express 5 and Node's built-in SQLite (`node:sqlite`), so there are no native build steps. Passwords use scrypt. Sessions are random tokens stored as hashes, sent in an HttpOnly, SameSite=Lax cookie. Every state change happens in one place: `server/domain/projects.ts` for the agreement workflow and `server/domain/payments.ts` for money.
- **Shared** (`shared/`): the rules used by both sides, so the browser and the server agree. It holds the service area, biography limit, pricing and refunds, matching, brief diffing and approvals, status copy, and the zod schemas.
- **Messaging** (`server/domain/messaging.ts`, `server/routes/messages.ts`): one-to-one conversations stored in SQLite and delivered through a per-account event stream. Every query is scoped to the two participants. See [docs/MESSAGING.md](docs/MESSAGING.md).
- **Payments** (`server/payments/provider.ts`): a demonstration provider by default. A Stripe provider is included for PaymentIntents, status sync, refunds and webhook verification. See [docs/PAYMENTS.md](docs/PAYMENTS.md) for what remains before live use.

Key files:

```
src/App.tsx                          routes and role guards
src/pages/ProjectWorkspace.tsx       the shared project workspace
src/pages/Match.tsx                  the guided matching wizard
src/components/home/CameraSequence.tsx
src/components/home/camera/          frame stage and the timing rules
server/routes/api.ts                 every API route
server/domain/projects.ts            agreement, approvals, delivery, reviews
server/domain/payments.ts            deposits, balances, refunds, payouts
server/seed.ts                       demonstration data, created through the domain functions
shared/*.ts                          shared rules and schemas
tests/e2e/*.spec.ts                  Playwright suite
server/tests/, shared/tests/         node:test suites
```

## Configuration

Copy `.env.example` to `.env` if you want to change defaults. The values are read from the environment. Never commit `.env`.

| Variable | Purpose |
| --- | --- |
| `PORT` | API and website port (default 4000) |
| `DB_PATH` | SQLite file (default `data/photoshoot.db`) |
| `RESET_DB`, `SEED_DEMO` | Wipe and re-seed, or skip the demonstration data |
| `UPLOADS_DIR`, `DIST_DIR` | Where uploads are stored and where the built site is served from |
| `COOKIE_SECURE` | Set `true` when serving over HTTPS |
| `PAYMENT_MODE` | `demo` (default) or `stripe` |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Live Stripe keys, required for `stripe` mode |
| `MESSAGE_SEND_LIMIT_PER_MINUTE`, `CONVERSATION_START_LIMIT_PER_HOUR`, `MESSAGE_STREAMS_PER_USER` | Per-account messaging limits (defaults 30, 10 and 5) |
| `REPORTS_PER_HOUR` | Message reports one account can file per hour (default 10) |
| `MODERATOR_EMAILS` | Reviewer addresses that self-service sign-up refuses (`EMAIL_RESERVED`). Signing in never grants review access |
| `STAFF_BOOTSTRAP_EMAIL`, `STAFF_BOOTSTRAP_PASSWORD` | Creates or confirms the reviewer account at start-up. Review access is granted only when the password matches. Reviewers decide message reports and refund requests |
| `ALLOWED_ORIGINS` | Extra origins allowed to use messaging, comma-separated |

## Sample imagery and credits

Public sample images live in `public/images/samples/`. Fifteen photographs of Los Angeles architecture, skylines and landscapes come from Wikimedia Commons under CC0, public domain, CC BY and CC BY-SA licences. Eight abstract compositions were generated for this project. The logo is the supplied wordmark (`public/brand/photoshoot-logo.png`), made transparent from the supplied JPG by removing its black background. The previous red badge is kept as `public/brand/photoshoot-logo-red-badge.png`, which the site does not use. Attribution for each image is in `public/images/samples/credits.json`, and the Policies page shows it. The Hollywood Sign and Capitol Records images may be sensitive to trademark use in commercial advertising, so check before using them outside this demonstration.

Helper scripts for these assets are in `scripts/`: `extract_logo.py` (logo extraction), `fetch_samples.py` and `generate_abstract.py` (sample imagery).

## Limitations

- **The camera is a set of renders, not a live model.** The frames come from a primitive-built model in `camera-pipeline/`, so changing the sequence means re-rendering. See [docs/CAMERA.md](docs/CAMERA.md).
- **Live payments are not exercised.** The Stripe path is implemented but has not been run against a Stripe account, because no keys were available. The browser tests and the integration tests run in demonstration mode.
- **Creator payouts are recorded, not sent.** Live payouts need Stripe Connect onboarding and transfers. See [docs/PAYMENTS.md](docs/PAYMENTS.md).
- **No email notifications.** Next steps appear in the workspace and on the dashboard; nothing is emailed.
- **Identity is not verified**, so no verification badge is shown.
- **Sample videos are preview frames.** Videography samples show a labelled still rather than a playable file. Uploaded videos do play.
- **Single-node storage.** SQLite and local file uploads suit a demonstration, not a multi-server deployment.
- **Matching is rule-based.** It scores profile data (services, coverage, packages, style, availability, reviews). It does not use travel distance.
- **Los Angeles means the City of Los Angeles.** To extend the area to Los Angeles County, edit `shared/service-area.ts`.
- **Messaging is not end-to-end encrypted.** The server stores message text so history can be shown, and moderators can read the copies kept with a report.
- **Messaging limits and live streams live in one process.** Rate limits and open streams are held in memory. A multi-server deployment needs shared storage and an event bus first.
- **No avatars or moderation screen yet.** The inbox shows initials. Moderators review reports through the API only.
- **Counsel has not reviewed the policy or the Terms.** The Refund and Cancellation Policy and the Terms and Conditions are demonstration drafts. Counsel must review them before live use.
- **Most refund decisions are made by a person.** Only a customer cancellation at least 72 hours before the start is refunded automatically. Every other request waits for a Photo Shoot reviewer. The open business decisions are in [docs/UNRESOLVED-DECISIONS.md](docs/UNRESOLVED-DECISIONS.md).
- **Live refunds are untested.** The Stripe refund path has not been run against a Stripe account. Demonstration refunds confirm at once.
- **Some refund features are not built.** There is no store credit, no separate rescheduling step, and no creator cancel button (a creator can cancel through the API only). Closed projects accept no refund requests.

## Documentation

- [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md): palette, type, layout, motion, and how UI UX Pro Max was used.
- [docs/CAMERA.md](docs/CAMERA.md): the camera sequence: the rendered frames, the capture flash, loading and fallbacks, and its limits. The render pipeline is in [camera-pipeline/](camera-pipeline/README.md).
- [docs/PAYMENTS.md](docs/PAYMENTS.md): demonstration versus live payments, the fee and refund rules and statuses, and what remains before real transactions.
- [docs/POLICY-TEXT.md](docs/POLICY-TEXT.md): the Refund and Cancellation Policy and the Terms and Conditions as customers read them, with the short versions. It is generated from `shared/policy.ts`, which the app displays.
- [docs/UNRESOLVED-DECISIONS.md](docs/UNRESOLVED-DECISIONS.md): the business decisions the policy and Terms leave open, for the owner and counsel.
- [docs/MESSAGING.md](docs/MESSAGING.md): private messaging, including the privacy model, limits, live updates, blocking and reporting, and what remains before live use.
- `design-system/photo-shoot/MASTER.md`: the raw output from the UI UX Pro Max generator.
