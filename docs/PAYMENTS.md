# Payments: demonstration today, live Stripe when configured

Photo Shoot is a marketplace, so money moves in three steps: the customer pays a deposit, pays a balance after completion, and each creator is paid out after commission. Refunds run the other way, under the Refund and Cancellation Policy. This document explains what runs in this build, what is simulated, and what remains before real transactions.

## Modes

| Mode | Selected when | What happens |
| --- | --- | --- |
| `demo` (default) | `PAYMENT_MODE=demo`, or no `STRIPE_SECRET_KEY` is set | Payment records are created and confirmed by the server. No card is charged and no money moves. Every payment screen is labelled "Demonstration". |
| `stripe` | `PAYMENT_MODE=stripe`, or a `STRIPE_SECRET_KEY` is set | Real Stripe PaymentIntents. Card details are collected by Stripe's Payment Element and never reach Photo Shoot's server. |

Check the active mode at `GET /api/config` (`paymentMode`) or on the server start-up banner.

## What is implemented

- **Amounts are computed on the server** from the agreed brief (`shared/pricing.ts`). The browser never supplies an amount.
- **Customer service fee**: 8% of the creators' package total.
- **Deposit**: 30% of the customer total, paid to confirm the booking.
- **Balance**: the remainder, paid after the customer confirms completion.
- **Creator commission**: 10% of each package. The payout after commission is shown to each creator.
- **Policy acceptance before payment.** A deposit is refused (`POLICY_REQUIRED`) unless the customer accepts the current Refund and Cancellation Policy and Terms. A stale version is refused with `POLICY_CHANGED`. The versions accepted are stored with the checkout, and the booking record keeps them with the packages, portfolio items and brief as they stood when the deposit succeeded.
- **Payment intents**: `startCheckout` creates a payment record and, in Stripe mode, a PaymentIntent with `automatic_payment_methods` and an idempotency key. An unfinished intent for the same amount is reused.
- **Confirmation is recorded from the provider.** In Stripe mode the browser calls `POST /api/payments/:id/sync`, which retrieves the PaymentIntent from Stripe and only then marks the payment successful. The webhook `payment_intent.succeeded` does the same independently, so a closed browser tab cannot leave a payment stuck.
- **Webhook verification**: `POST /api/webhooks/stripe` checks the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET`. It handles `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, and every `refund.*` event.
- **Idempotent state changes**: a successful deposit moves an agreed project to `booked`. A successful balance moves a completed project to `closed` and schedules payouts. Repeating either event changes nothing.
- **Refunds** follow the rules in the next section.
- **Disputes and refund requests** pause scheduled payouts (`held`) while they are open. Withdrawing the last open request releases them.

## Refund rules and statuses

The published rules are in `shared/policy.ts`. The code that applies them is in `server/domain/refunds.ts` (writes), `server/domain/refund-core.ts` (the read model and status copy) and `shared/cancellation.ts` (the time arithmetic).

### Cancellation and the 72-hour guarantee

- The cancellation time is the server time when the cancellation is accepted. It is stored as a UTC instant.
- The scheduled start is the shoot date and start time in the agreed brief, read in `America/Los_Angeles`. Daylight saving is applied for that date.
- A cancellation qualifies when the elapsed time from cancellation to start is at least 72 hours. Exactly 72 hours qualifies. Business days and calendar labels are not used.
- A qualifying customer cancellation is approved automatically. The refund is everything paid toward the booking: deposit, balance if paid, and every fee. Nothing is deducted.
- These are not refunded automatically. They become a refund request with status `under_review`, and a reviewer decides them in writing:
  - a cancellation less than 72 hours before the start;
  - a cancellation by a creator (the policy does not yet set a rule for this; see [UNRESOLVED-DECISIONS.md](UNRESOLVED-DECISIONS.md));
  - a booking with no usable start time, so the deadline cannot be calculated.
- Eligibility is fixed when the cancellation is recorded. A later review does not change it.
- A repeated cancellation returns the recorded cancellation and sends no second refund.

### Quality and delivery requests

- Reasons: agreed work not delivered, or delivered work below the quality represented at booking.
- A description of at least 20 characters is required. Evidence can also include portfolio items, delivered files and project messages, but only items that belong to the booking are accepted. The agreement version is attached automatically.
- These requests do not depend on the cancellation deadline. Agreed work not delivered can be requested from the time the booking is confirmed. Delivered work below the represented quality can be requested once work is delivered (`delivered`, `revision_requested`, `completed`). Closed projects accept neither; see [UNRESOLVED-DECISIONS.md](UNRESOLVED-DECISIONS.md). The two status lists live in `shared/refund-rules.ts`, so the server and the browser agree.
- A creator can add a response. A creator cannot decide a complaint about their own work alone.
- A reviewer who is part of the booking cannot decide its requests (`CONFLICT_OF_INTEREST`).
- A reviewer enters the approved amount in cents. It cannot exceed the amount paid that is still refundable (`OVER_REFUND`).

### Statuses

| Status | Meaning | Set by |
| --- | --- | --- |
| `submitted` | Request received | The customer, when submitted |
| `under_review` | A reviewer is deciding it | The system, for cancellations that do not qualify automatically |
| `approved` | Refund decided, with the amount recorded | The system (qualifying cancellation) or a reviewer |
| `declined` | Not approved, with reasons | A reviewer |
| `withdrawn` | Withdrawn by the customer before a decision | The customer |
| `refund_initiated` | The provider accepted the refund and is confirming it | The server, after the provider call |
| `refunded` | The provider confirmed the refund | The provider, through the server |
| `refund_failed` | The provider did not complete the refund. "Try again" sends the same refund again | The server |
| `not_required` | Nothing was paid, so no refund is due | The system |

A request only moves forward. A `refunded` request never moves back. A request is `refunded` only when every payment transfer for it has succeeded.

### Money safety

- Each payment transfer is claimed with a compare-and-set before the provider is called, so a double click cannot start a second refund.
- The transfer id is the refund id sent to the provider. Stripe receives it as the idempotency key `refund-<transfer id>`, so a retry after a lost response cannot refund twice.
- Refunds are allocated to the most recent payments first.
- The provider's `refund.*` webhooks update the same records. A browser action never marks a refund complete.
- A cancelled booking stays cancelled when a refund fails. The refund request shows `refund_failed` and offers "Try again".

### Demonstration mode

No money moves. Demonstration refunds are confirmed at once and are labelled "(demonstration: no money moves)".

## Running the Stripe path

1. Create a Stripe account and copy the test keys from the Dashboard (Developers > API keys).
2. Set the environment variables (see `.env.example`):
   ```
   PAYMENT_MODE=stripe
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
3. Forward webhooks to the local server while testing:
   ```
   stripe listen --forward-to localhost:4000/api/webhooks/stripe
   ```
   Use the `whsec_` value it prints as `STRIPE_WEBHOOK_SECRET`.
4. Start the server (`npm run build && npm start`) and book a project. Use the test card `4242 4242 4242 4242` with any future expiry and any CVC.

Automated tests never call Stripe. The Playwright suite and the integration tests set `PAYMENT_MODE=demo`, so they run without network access or keys. The Stripe refund path is implemented but has not been run against a Stripe account.

## What remains before real transactions

These items are deliberately not in this build. Each one needs a business or operational decision as well as code. The business questions are listed in [UNRESOLVED-DECISIONS.md](UNRESOLVED-DECISIONS.md).

1. **Creator payouts (Stripe Connect).** Creators are currently paid out as scheduled records only. Live payouts need Stripe Connect Express accounts: onboard each creator, store the connected account ID on the user, and transfer the creator's payout share when the scheduled date arrives. Connect onboarding includes identity checks that the platform must run.
2. **Webhook registration in production.** Register `https://<your-domain>/api/webhooks/stripe` in the Stripe Dashboard with the events above, including the `refund.*` events, and rotate the signing secret into the environment.
3. **Refund operations.** Refund requests are decided by reviewers in the staff queue at `/staff/refunds`. Chargebacks (`charge.dispute.created`) are not handled yet. Add a handler that holds payouts and notifies the team.
4. **Tax.** No sales tax is calculated. Decide which jurisdictions apply and add Stripe Tax or a tax provider before charging.
5. **Currency and rounding.** Amounts are USD integer cents, rounded to the nearest cent on each step. Confirm rounding rules with your accountant.
6. **Terms and policy.** The Refund and Cancellation Policy and the Terms and Conditions (versions in `shared/policy.ts`) describe this build. Qualified counsel must review them before launch.
7. **Production hardening.** Move from SQLite to a managed database, serve over HTTPS, set `COOKIE_SECURE=true`, add rate limiting to sign-in and payment endpoints, and store secrets in a secrets manager.
8. **Trust claims.** Verification badges are not shown because identity is not verified in this build. Add them only when the verification process exists.

## Where the code lives

- `shared/pricing.ts`: fee, commission and deposit arithmetic (unit-tested).
- `shared/policy.ts`: the published policy and Terms text, the two guarantees, and the version numbers.
- `shared/cancellation.ts`: Los Angeles wall-clock times and the 72-hour test (unit-tested).
- `server/domain/policy.ts`: policy acceptance, version checks and the booking record.
- `server/domain/refunds.ts`: cancellation, refund requests, reviewer decisions and provider refunds.
- `server/domain/refund-core.ts`: the refund read model, status copy and refundable amounts.
- `server/payments/provider.ts`: the demo and Stripe provider adapters and webhook verification.
- `server/domain/payments.ts`: checkout, confirmation and sync.
- `server/routes/api.ts`: the payment, refund and webhook routes.
- `src/pages/Checkout.tsx`: the policy gate, the demonstration confirmation and the Stripe Payment Element.
- `src/components/refunds/RefundPanel.tsx`: the cancellation, request and booking-record panel on the Payments tab.
- `src/pages/StaffRefunds.tsx`: the reviewer queue.
