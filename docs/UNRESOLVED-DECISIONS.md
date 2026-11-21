# Unresolved business decisions: Refund and Cancellation Policy and Terms

These questions are not answered by the published Refund and Cancellation Policy or the Terms and Conditions (version 2026-11-21). The published text does not invent answers. Where the build needs an outcome for one of these cases today, it sends the case to a Photo Shoot reviewer, who decides in writing with reasons.

Each item gives the decision needed, what the build does now, and where the published text says so. Qualified counsel must review the Terms and the policy before any live use (item 15).

## Cancellations and timing

1. **Cancellations less than 72 hours before the session.** Decide whether any refund, partial refund or fee applies, and on what basis.
   - Build now: no refund is promised. The cancellation is recorded and becomes a refund request for a reviewer. No penalty is applied.
   - Text: "Cancellations less than 72 hours before the session".

2. **Creator cancellations of a confirmed booking.** Decide what the customer receives, and what the creator must do (for example a replacement creator, a fee or a penalty).
   - Build now: an accepted team member can cancel through the API. The app has no creator cancel button yet. The booking closes, payouts are held, and a reviewer decides any refund. Nothing is refunded automatically.
   - Text: "When a creator cancels".

3. **Creator no-shows.** Decide the remedy beyond the request for agreed work that was not delivered.
   - Build now: the customer can request a refund for agreed work not delivered, and a reviewer decides it.
   - Text: "Agreed work that is not delivered".

4. **Rescheduling.** Decide whether a shoot can be moved without cancelling, whether the 72-hour clock restarts when it is moved, and whether a creator can refuse a new date.
   - Build now: a new date is a change to the agreed brief and needs approval from every affected person. The 72-hour deadline uses the start time in the agreed brief at the moment of cancellation. There is no separate rescheduling feature.
   - Text: "Changes to the shoot".

5. **A brief without a usable start time.** Decide whether a booking can be confirmed without a shoot date and start time.
   - Build now: if the start time is missing, the 72-hour deadline cannot be calculated. The cancellation goes to a reviewer and the checkout page says the deadline cannot be shown.

6. **Complaints after a project closes.** The balance payment closes the project and schedules creator payouts. After that, the build does not accept refund requests or disputes. The brief asks that quality complaints are not limited by the cancellation deadline, so decide whether quality and delivery complaints stay open after closing, and how a refund is recovered from a creator whose payout has already been released.
   - Build now: a refund request or a dispute is accepted until the project closes. A quality request needs delivered work. Closed projects accept neither.
   - Text: the policy says when requests can be made, and that the policy does not yet say how a complaint after closing is handled.

## Refund amounts and timelines

7. **Quality refund amounts.** Decide whether an approved quality or delivery complaint is refunded in full, in part, or by a formula, and how a booking with two creators is split.
   - Build now: a reviewer decides the amount in writing with reasons. No formula is applied.
   - Text: "The quality and delivery guarantee" and "More than one creator on a booking".

8. **Complaint and review timelines.** Decide how long reviewers take, how long a creator has to respond, and how long a request may stay open.
   - Build now: no timescale is promised. The project page shows each status. Payouts are held while a request is open, so a long review holds creator payouts for as long as it stays open.
   - Text: "How requests are reviewed". The earlier "reply within 5 business days" wording has been removed from the dispute panel and the project status.

9. **Refund processing time.** Decide whether to publish an estimate. Only a refund the provider has confirmed is shown as "Refunded". Card issuers control when the money appears.
   - Build now: no estimate is shown.

10. **Processing fees on refunds.** The policy says a qualifying full refund deducts no cancellation, administration or processing fee. Decide who bears any processing fee the provider does not return.
    - Build now: the full amount paid is refunded. Processing fees are not modelled.

11. **Store credit.** Decide whether to offer store credit. If it is offered, it must be the customer's choice.
    - Build now: not built. The policy says store credit is not offered in this version.

12. **Removing one creator from a confirmed booking.** Decide whether this is allowed, and how money for that creator's work is refunded.
    - Build now: not supported.

13. **Two routes for money problems.** The build has a refund request and a separate "Open a dispute" action. Decide whether to keep both or merge them into one process.

## Terms and legal

14. **Governing law and venue.** Counsel to confirm. The Terms currently say they will be confirmed before live use.

15. **Counsel review before live use.** Counsel must review the whole Terms and Conditions and the Refund and Cancellation Policy. The demonstration text is a draft until then.

16. **Liability.** The Terms exclude only indirect losses, and only to the extent the law allows. Decide with counsel whether any limitation of liability is wanted, and its wording. Any wording must not cut across the two guarantees.

17. **California consumer law.** The policy says nothing limits rights under applicable law, including California consumer law. Counsel to check whether any cancellation or refund wording needs to change for California customers.

18. **Policy versions.** Decide when version 2026-11-21 becomes final. Once a customer has accepted a version, any change needs a new version. Each booking keeps the version the customer accepted.

## Operations

19. **Who reviews.** Decide who may act as a reviewer, how they are trained, and how many are needed. A reviewer must not be part of the booking under review. Today the only reviewer is the account created or confirmed by the start-up bootstrap (STAFF_BOOTSTRAP_EMAIL and STAFF_BOOTSTRAP_PASSWORD).

20. **Payout holds.** Decide how long payouts stay held during an open request, and whether creators are told when a hold starts.

21. **Chargebacks.** The build does not handle chargebacks (`charge.dispute.created`). Decide the process, including whether payouts are held.

22. **Live Stripe refunds.** The Stripe refund path has not been run against a Stripe account. Before live use, verify the refund webhook events and the behaviour when the provider refuses a refund.

23. **Tax.** Decide the tax treatment of the customer service fee and of refunds, with an accountant (see docs/PAYMENTS.md).

24. **When "agreed work not delivered" can be raised.** The build opens this reason from the time the booking is confirmed, and a reviewer decides whether the work was delivered. Decide whether it should open only after the scheduled start, to avoid early requests.
