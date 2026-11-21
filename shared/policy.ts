/**
 * The Refund and Cancellation Policy and the Terms and Conditions, as published text.
 *
 * This file is the single source for every customer-facing summary of the policy. Each published version stays in
 * POLICY_VERSIONS, so a booking can always point to the exact text the customer accepted.
 *
 * Plain language, written for customers and creators. Drafted for the demonstration; qualified counsel must review
 * the Terms before live use (see docs/UNRESOLVED-DECISIONS.md).
 */

export const REFUND_POLICY_VERSION = '2026-11-21';
export const TERMS_VERSION = '2026-11-21';

/** Time zone used for every scheduled start and cancellation deadline shown to people. */
export const BOOKING_TIME_ZONE = 'America/Los_Angeles';
export const BOOKING_TIME_ZONE_LABEL = 'Los Angeles time';

/** Advance-cancellation guarantee threshold, in elapsed hours. Exactly this many hours qualifies. */
export const CANCELLATION_GUARANTEE_HOURS = 72;

export const QUALITY_GUARANTEE =
  'Customers are entitled to a refund if their photographer or videographer fails to provide the agreed work or delivers work that does not meet the quality represented in their profile and portfolio at the time of booking.';

export const CANCELLATION_GUARANTEE =
  'Customers who cancel their booked session at least 72 hours before its scheduled start time are entitled to a full refund.';

/** Short versions for checkout and cancellation screens. They point to the full policy and never weaken it. */
export const QUALITY_SUMMARY =
  'If your photographer or videographer does not deliver the agreed work, or delivers work below the quality shown in their profile and portfolio at booking, you are entitled to a refund.';

export const CANCELLATION_SUMMARY =
  'Cancel at least 72 hours before the scheduled start (Los Angeles time) and you are entitled to a full refund of everything you paid toward the booking, including the deposit and the customer service fee.';

export interface PolicyItem {
  label?: string;
  text: string;
}

export interface PolicySection {
  id: string;
  title: string;
  paragraphs: string[];
  items?: PolicyItem[];
}

export const REFUND_POLICY_TITLE = 'Refund and Cancellation Policy';
export const TERMS_TITLE = 'Terms and Conditions';

export const REFUND_POLICY_SECTIONS: PolicySection[] = [
  {
    id: 'about',
    title: 'About this policy',
    paragraphs: [
      'This policy explains when you can get a refund for a booking on Photo Shoot, how to ask for one, how we review requests, and how refunds are paid back. It applies to customers and to creators, and it forms part of our Terms and Conditions.',
      'A creator’s profile, package description or project terms cannot reduce the protections in this policy. Nothing in this policy limits rights you have under applicable law, including California consumer law.',
    ],
  },
  {
    id: 'protections',
    title: 'Our two customer protections',
    paragraphs: ['These are Photo Shoot platform policies. They apply to every booking made through the platform.'],
    items: [
      { label: 'Quality and delivery guarantee:', text: QUALITY_GUARANTEE },
      { label: '72-hour cancellation guarantee:', text: CANCELLATION_GUARANTEE },
    ],
  },
  {
    id: 'quality',
    title: 'The quality and delivery guarantee',
    paragraphs: [
      'Creators must deliver work consistent with:',
    ],
    items: [
      { text: 'the professional and technical quality shown in their portfolio at the time of booking;' },
      { text: 'the services and capabilities shown on their profile;' },
      { text: 'the customer’s approved project brief; and' },
      { text: 'the agreed deliverables, editing requirements and delivery schedule.' },
    ],
  },
  {
    id: 'quality-assessment',
    title: 'How we assess quality',
    paragraphs: [
      'Relevant quality factors can include image clarity, focus, exposure and editing. For video they can include resolution, stabilization and audio quality, where they apply to the service that was booked.',
      'We assess quality fairly, in the context of the agreed project. Finished work does not need to duplicate a portfolio photograph or video exactly. It must meet the standard the creator represented and the customer booked.',
      'We compare the work with the booking-time record: the profile, portfolio items, package and approved brief as they stood when the booking was confirmed. Later changes to a profile do not change that comparison.',
      'If a complaint is approved, the customer is entitled to a refund. This version does not yet set a fixed rule for whether an approved refund covers the full amount or only part of it. The written decision states the amount and the reasons for it.',
      'A revision or reshoot may be offered as an optional way to resolve a complaint. It never replaces a refund entitlement, and you do not have to accept one.',
    ],
  },
  {
    id: 'cancellation',
    title: 'The 72-hour cancellation guarantee',
    paragraphs: [
      'Customers who cancel their booked session at least 72 hours before its scheduled start time are entitled to a full refund. Exactly 72 hours qualifies.',
      'We count actual elapsed hours, not business days or calendar labels. The scheduled start is the shoot date and start time in the agreed brief, in Los Angeles time, including daylight saving changes. Your project page shows the cancellation deadline in Los Angeles time before you pay and before you cancel.',
      'The cancellation time is recorded when your cancellation is successfully submitted. Whether it qualifies depends only on that time. It does not depend on when a creator or Photo Shoot reads or approves the cancellation.',
      'A full refund is 100% of the amount paid toward the cancelled booking. That includes the deposit, the customer service fee and any other mandatory booking or platform fee. We do not deduct cancellation, administration or payment-processing fees from a qualifying full refund.',
      'Refunds return to the original payment method wherever the payment provider supports it. This version does not offer store credit. If store credit is offered later, it will be used only if you choose it.',
    ],
  },
  {
    id: 'late-cancellation',
    title: 'Cancellations less than 72 hours before the session',
    paragraphs: [
      'A cancellation made less than 72 hours before the scheduled start is not covered by the 72-hour guarantee. The cancellation is still recorded, and it becomes a refund request that Photo Shoot reviews using the signed agreement, the payment record and the project messages.',
      'This policy does not promise a refund, or a particular amount, for a cancellation made less than 72 hours before the session. Each request is decided in writing, with the reasons.',
    ],
  },
  {
    id: 'creator-cancellation',
    title: 'When a creator cancels',
    paragraphs: [
      'If a creator cancels a confirmed booking, the booking closes, payouts for it are held, and a Photo Shoot reviewer decides any refund in writing, with the reasons.',
      'This version does not yet set a fixed rule for creator cancellations, including how much is refunded. A creator cancellation is never refunded automatically.',
    ],
  },
  {
    id: 'before-booking',
    title: 'Before a booking is confirmed',
    paragraphs: [
      'Nothing is charged until the deposit is paid. A cancellation before then has nothing to refund, and the project closes.',
    ],
  },
  {
    id: 'separate-grounds',
    title: 'Separate refund grounds',
    paragraphs: [
      'The 72-hour deadline applies only to the advance-cancellation guarantee. It never removes your separate right to a refund for agreed work that was not delivered, or for work that fails the quality guarantee. Each request is reviewed on its own.',
    ],
  },
  {
    id: 'how-to-request',
    title: 'How to request a refund',
    paragraphs: [
      'Signed-in customers can request a refund from the Payments tab of their project. Choose one reason. A request cannot be made once the project is closed, which happens when the balance is paid. This version does not yet say how a complaint raised after that is handled.',
    ],
    items: [
      { text: 'Cancellation. Cancelling at least 72 hours before the shoot applies the guarantee automatically. A cancellation made less than 72 hours before the shoot is recorded and reviewed.' },
      { text: 'Agreed work not delivered. Available from the time the booking is confirmed. A reviewer decides whether the agreed work was delivered.' },
      { text: 'Delivered work below the represented quality. Available once work has been delivered, and before the balance is paid.' },
    ],
  },
  {
    id: 'evidence',
    title: 'What to include with a delivery or quality request',
    paragraphs: [
      'Describe the problem in your own words. The agreement version is included automatically. Then select the portfolio examples, delivered files and project messages to include. Only the parties to the booking and Photo Shoot reviewers can see this evidence.',
    ],
  },
  {
    id: 'review',
    title: 'How requests are reviewed',
    paragraphs: [
      'Creators can respond to a complaint and add their own evidence. A creator cannot approve or reject a complaint about their own work alone.',
      'This version does not yet set a fixed response time for complaints or reviews. Your project page shows where each request stands.',
    ],
    items: [
      { text: 'A Photo Shoot reviewer who was not part of the booking reviews the evidence from both sides and makes the decision.' },
      { text: 'Every decision states its reasons. An approved refund states its amount.' },
      { text: 'You can withdraw a request that has not been decided.' },
    ],
  },
  {
    id: 'status',
    title: 'What each refund status means',
    paragraphs: [
      'Your project page shows where each request stands. The stages are kept separate, so you can see exactly what has happened.',
    ],
    items: [
      { label: 'Submitted:', text: 'We received your request.' },
      { label: 'Under review:', text: 'A Photo Shoot reviewer is looking at the evidence from both sides.' },
      { label: 'Approved:', text: 'The refund is decided. Qualifying cancellations are approved automatically when you cancel.' },
      { label: 'Refund sent to the payment provider:', text: 'The provider has accepted the refund. Photo Shoot is waiting for the provider to confirm it.' },
      { label: 'Refunded:', text: 'The provider has confirmed the refund. Your bank or card issuer controls when the funds appear in your account, and Photo Shoot cannot promise a timescale.' },
      { label: 'Declined:', text: 'The request was reviewed and not approved. The reasons are shown.' },
      { label: 'Withdrawn:', text: 'You withdrew the request before a decision.' },
      { label: 'Refund failed:', text: 'The provider did not complete the refund. You can ask us to try again. A refund is never issued twice.' },
    ],
  },
  {
    id: 'payments',
    title: 'Payment status and the payment provider',
    paragraphs: [
      'A booking is confirmed only after the payment provider reports a successful payment. A refund is shown as refunded only after the provider confirms it. Photo Shoot does not mark a payment or refund complete from the browser alone.',
      'In the demonstration environment, no real money moves. Every payment and refund is labelled as a demonstration.',
    ],
  },
  {
    id: 'multiple-creators',
    title: 'More than one creator on a booking',
    paragraphs: [
      'A booking can include more than one creator. The customer pays one total, including the service fee, and the guarantees apply to the whole booking. Cancelling the booking refunds everything paid toward it.',
      'A complaint says which creator’s work it concerns. The written decision states how a refund for one creator’s work is calculated. Removing one creator from a confirmed booking is not yet supported.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes to the shoot',
    paragraphs: [
      'A change to the shoot date, start time, deliverables or other brief terms is a change to the agreed brief. Every affected person named in the agreement must approve it before it takes effect. Until then, the agreed brief still applies.',
      'The 72-hour deadline is calculated from the start time in the agreed brief at the time you cancel. This version does not set a separate rescheduling rule. A new shoot date is a change to the agreed brief and follows the approval step above.',
    ],
  },
  {
    id: 'not-delivered',
    title: 'Agreed work that is not delivered',
    paragraphs: [
      'If a creator does not attend a confirmed session, the agreed work has not been delivered. You can request a refund for agreed work that was not delivered. We review it like any other request, using the signed agreement, the project messages and the delivery record. This version does not set a separate fixed rule for no-shows; the review decides them.',
    ],
  },
  {
    id: 'records',
    title: 'Booking records',
    paragraphs: [
      'When you pay the deposit, we keep a record of the policy and terms versions you accepted, each creator’s profile and portfolio items, the package, the approved brief and the payment results. Your project page shows this record, and the version of this policy you accepted stays available on this page.',
    ],
  },
  {
    id: 'policy-changes',
    title: 'Changes to this policy',
    paragraphs: [
      'We may publish a new version of this policy. A new version applies to bookings made after it takes effect. Each booking keeps the version you accepted at checkout.',
    ],
  },
];

export const TERMS_SECTIONS: PolicySection[] = [
  {
    id: 'about-terms',
    title: 'About these Terms',
    paragraphs: [
      'These Terms and Conditions govern your use of Photo Shoot. Photo Shoot is a marketplace that connects customers with photographers and videographers who work in the City of Los Angeles. Creators are independent professionals, not employees of Photo Shoot.',
      'This is a demonstration environment. These Terms are written for the demonstration and must be reviewed by qualified counsel before live use.',
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts and accurate information',
    paragraphs: ['Keep your account information accurate and your password private. Each person should hold one account.'],
    items: [
      { text: 'Tell us promptly if your details change.' },
      { text: 'We may suspend an account that breaks these Terms, and we will explain why when we can.' },
    ],
  },
  {
    id: 'creator-representations',
    title: 'Creators represent their work accurately',
    paragraphs: ['Your profile is a representation to customers. Creators must:'],
    items: [
      { text: 'use portfolio items that are their own work, or work they have the right to show, and describe their role in each accurately;' },
      { text: 'keep services, packages, prices, coverage and availability accurate and up to date;' },
      { text: 'not overstate their experience, capabilities or results.' },
    ],
  },
  {
    id: 'creator-obligations',
    title: 'Creators fulfil the approved agreement',
    paragraphs: ['Once the brief is approved, the creator must:'],
    items: [
      { text: 'deliver the agreed work, meeting the agreed deliverables, editing requirements and delivery schedule;' },
      { text: 'follow the approved brief, and tell the customer promptly if they cannot meet it;' },
      { text: 'give the customer clear notice if they need to cancel a confirmed booking.' },
    ],
  },
  {
    id: 'customer-obligations',
    title: 'Customers provide accurate briefs and pay as agreed',
    paragraphs: ['Customers must:'],
    items: [
      { text: 'describe the work in the brief accurately, and give any access and information the shoot needs;' },
      { text: 'pay the deposit and any balance when it falls due;' },
      { text: 'respond to deliveries and revision requests within the time the project shows.' },
    ],
  },
  {
    id: 'agreed-brief',
    title: 'The agreed brief',
    paragraphs: [
      'The approved project brief is the agreement for the booking. Everyone named in it approves the same version. A change takes effect only after every affected person approves it. Until then, the agreed brief still applies.',
    ],
  },
  {
    id: 'fees',
    title: 'Fees and payments',
    paragraphs: ['The price you see is shown before you pay:'],
    items: [
      { text: 'a customer service fee of 8% is added to the creators’ package prices;' },
      { text: 'creators keep their package price less a 10% platform commission;' },
      { text: 'a deposit of 30% of the total books the booking, and the balance is due after you confirm completion;' },
      { text: 'payments are processed by a payment provider. Photo Shoot does not store card details.' },
    ],
  },
  {
    id: 'cancellations-terms',
    title: 'Cancellations and refunds',
    paragraphs: [
      'The Refund and Cancellation Policy sets out the 72-hour cancellation guarantee, the quality and delivery guarantee, how refunds are calculated and paid back, and how requests are reviewed. It forms part of these Terms.',
      'Your rights under the Refund and Cancellation Policy are not reduced by these Terms, by a creator’s profile, or by project terms.',
    ],
  },
  {
    id: 'disputes',
    title: 'Disputes and refund reviews',
    paragraphs: [
      'Photo Shoot reviews disputes and refund requests. We review the evidence from both parties. A creator cannot decide a complaint about their own work alone. Photo Shoot administers refunds through the payment provider and records the provider’s results.',
      'While a dispute or refund request is open, payouts for the booking are held.',
    ],
  },
  {
    id: 'multiple-creators-terms',
    title: 'Projects with more than one creator',
    paragraphs: [
      'The Refund and Cancellation Policy applies to the whole booking. Each creator’s obligations are set out in the agreed brief. A refund for one creator’s work is decided as the written decision states.',
    ],
  },
  {
    id: 'platform-guarantees',
    title: 'Platform guarantees come first',
    paragraphs: [
      'A creator’s profile description, package text or project terms cannot override the quality and delivery guarantee or the 72-hour cancellation guarantee. If they conflict, the platform guarantees apply.',
    ],
  },
  {
    id: 'reviews',
    title: 'Reviews',
    paragraphs: [
      'Reviews can be left after a completed booking. They must be honest and based on the project. Photo Shoot may remove a review that breaks these Terms.',
    ],
  },
  {
    id: 'liability',
    title: 'Liability',
    paragraphs: [
      'To the extent the law allows, Photo Shoot is not responsible for indirect losses that arise from a booking. This does not limit any right you have under the law, including the protections in the Refund and Cancellation Policy, and it does not exclude liability that the law does not allow us to exclude.',
    ],
  },
  {
    id: 'governing-law',
    title: 'Governing law',
    paragraphs: ['Governing law and venue will be confirmed by counsel before live use.'],
  },
  {
    id: 'terms-changes',
    title: 'Changes to these Terms',
    paragraphs: [
      'We may update these Terms. A new version applies to bookings made after it takes effect. Each booking keeps the version accepted at checkout.',
    ],
  },
];

export interface PublishedPolicy {
  version: string;
  refund: PolicySection[];
  terms: PolicySection[];
}

/** Every published version. Add new versions here; never edit a published one. */
export const POLICY_VERSIONS: Record<string, PublishedPolicy> = {
  [REFUND_POLICY_VERSION]: { version: REFUND_POLICY_VERSION, refund: REFUND_POLICY_SECTIONS, terms: TERMS_SECTIONS },
};

export function publishedPolicy(version: string): PublishedPolicy | undefined {
  return POLICY_VERSIONS[version];
}
