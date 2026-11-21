export type Role = 'customer' | 'creator';
export type ServiceNeed = 'photography' | 'videography' | 'both';
export type ServiceKind = 'photography' | 'videography';
export type UsageRights = 'portfolio' | 'social-web-12m' | 'commercial-12m';

export type ProjectStatus =
  | 'draft'
  | 'recruiting'
  | 'agreement_pending'
  | 'agreed'
  | 'booked'
  | 'delivered'
  | 'revision_requested'
  | 'completed'
  | 'closed'
  | 'cancelled'
  | 'disputed';

export type MemberStatus = 'interested' | 'invited' | 'accepted' | 'declined';
export type BriefStatus = 'draft' | 'pending' | 'accepted' | 'superseded' | 'withdrawn';
export type PaymentKind = 'deposit' | 'balance' | 'refund';
export type PaymentStatus = 'requires_payment' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
export type PaymentMode = 'demo' | 'stripe';

export interface UserSummary {
  id: string;
  name: string;
  initials: string;
  role: Role;
  bio: string;
  bioWords: number;
  isDemo: boolean;
  createdAt: string;
}

export interface CreatorPackage {
  id: string;
  service: ServiceKind;
  name: string;
  hours: number;
  priceCents: number;
  deliverables: string;
}

export interface PortfolioItem {
  id: string;
  creatorId: string;
  kind: 'photo' | 'video';
  title: string;
  contribution: string;
  mediaUrl: string;
  posterUrl: string | null;
  projectLabel: string;
  isDemo: boolean;
  createdAt: string;
}

export interface ReviewSummary {
  count: number;
  average: number | null;
}

export interface FitInfo {
  score: number;
  reasons: string[];
  cautions: string[];
  /** Which packages would be used if this creator is hired for the brief. */
  recommended: Array<{ service: ServiceKind; packageId: string; packageName: string; priceCents: number }>;
  /** Solo means this creator can cover every service requested. */
  coversAllServices: boolean;
}

export interface PortfolioPreviewItem {
  id: string;
  mediaUrl: string;
  title: string;
  isDemo: boolean;
}

export interface CreatorCard {
  id: string;
  name: string;
  initials: string;
  services: ServiceNeed;
  specialties: string[];
  styles: string[];
  neighborhoods: string[];
  citywide: boolean;
  coverageLabel: string;
  seekingClients: boolean;
  bioExcerpt: string;
  /** The first three photos in the creator's saved order. Empty when none are uploaded. */
  portfolioPreview: PortfolioPreviewItem[];
  packages: CreatorPackage[];
  priceFromCents: number | null;
  nextAvailableDate: string | null;
  rating: ReviewSummary;
  completedProjects: number;
  isDemo: boolean;
  fit: FitInfo | null;
}

export interface DiscoveryResponse {
  creators: CreatorCard[];
  criteria: DiscoveryCriteria;
  excluded: Record<'service' | 'location' | 'budget' | 'availability' | 'notSeeking' | 'rating' | 'style', number>;
  totalCreators: number;
}

export interface DiscoveryCriteria {
  services: ServiceNeed | 'any';
  neighborhood: string | null;
  budgetCents: number | null;
  styles: string[];
  date: string | null;
  minRating: number | null;
  sort: 'best' | 'rating' | 'price';
}

export interface CreatorProfile {
  user: UserSummary;
  services: ServiceNeed;
  specialties: string[];
  styles: string[];
  neighborhoods: string[];
  citywide: boolean;
  coverageLabel: string;
  seekingClients: boolean;
  yearsExperience: number;
  weekdays: number[];
  typicalHours: string;
  packages: CreatorPackage[];
  portfolio: PortfolioItem[];
  rating: ReviewSummary;
  completedProjects: number;
  availableDates: string[];
  bookedDates: string[];
  nextAvailableDate: string | null;
  priceFromCents: number | null;
  reviews: ReviewItem[];
}

export interface CustomerProfile {
  user: UserSummary;
  customerType: 'individual' | 'business';
  businessName: string;
  interests: string[];
  neighborhood: string;
  completedProjects: number;
  reviews: ReviewItem[];
}

export interface ReviewItem {
  id: string;
  projectId: string;
  projectTitle: string;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: Role;
  revieweeId: string;
  communication: number;
  reliability: number;
  professionalism: number;
  quality: number;
  expectationsMet: boolean;
  average: number;
  body: string;
  isDemo: boolean;
  createdAt: string;
}

export interface BriefMember {
  userId: string;
  creatorName: string;
  roleLabel: string;
  service: ServiceKind;
  packageId: string;
  packageName: string;
  hours: number;
  priceCents: number;
  responsibilities: string;
}

export interface VideoDeliverable {
  count: number;
  lengthSeconds: number;
}

export interface BriefContent {
  title: string;
  goals: string;
  creativeDirection: string;
  shootDate: string;
  shootStartTime: string;
  durationHours: number;
  neighborhood: string;
  locationDetail: string;
  photoCount: number;
  video: VideoDeliverable;
  otherDeliverables: string;
  editingRequirements: string;
  includedRevisions: number;
  deliveryDeadline: string;
  usageRights: UsageRights;
  members: BriefMember[];
}

export interface BriefApprover {
  userId: string;
  name: string;
  approved: boolean;
}

export interface BriefVersion {
  id: string;
  versionNo: number;
  status: BriefStatus;
  content: BriefContent;
  approvers: BriefApprover[];
  changeSummary: string[];
  createdAt: string;
  acceptedAt: string | null;
}

export interface ProjectMember {
  userId: string;
  name: string;
  initials: string;
  status: MemberStatus;
  message: string;
  isDemo: boolean;
}

export interface QuoteView {
  basis: 'accepted' | 'draft' | 'none';
  subtotalCents: number;
  customerFeeCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  creatorCommissionCents: number;
  creatorPayoutCents: number;
  lines: Array<{ userId: string; name: string; roleLabel: string; packageName: string; priceCents: number; payoutCents: number; commissionCents: number }>;
}

export interface PaymentView {
  id: string;
  kind: PaymentKind;
  amountCents: number;
  status: PaymentStatus;
  provider: PaymentMode;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutView {
  creatorName: string;
  amountCents: number;
  commissionCents: number;
  status: 'scheduled' | 'held' | 'paid';
  scheduledFor: string;
}

export interface DeliveryView {
  id: string;
  round: number;
  fileName: string;
  fileUrl: string;
  kind: 'photo' | 'video' | 'other';
  sizeBytes: number;
  note: string;
  uploadedBy: string;
  createdAt: string;
}

export interface RevisionView {
  id: string;
  notes: string;
  status: 'open' | 'completed';
  requestedBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface MessageView {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  body: string;
  createdAt: string;
}

export interface EventView {
  id: string;
  message: string;
  createdAt: string;
}

export interface NextStep {
  forRole: 'customer' | 'creator' | 'both' | 'none';
  title: string;
  body: string;
  action: 'none' | 'accept' | 'send_agreement' | 'approve' | 'pay_deposit' | 'upload' | 'request_revision' | 'confirm_completion' | 'pay_balance' | 'review' | 'invite' | 'express_interest';
}

export interface Permissions {
  viewerRole: Role | null;
  viewerIsCustomer: boolean;
  viewerIsMember: boolean;
  canEditDraft: boolean;
  canInvite: boolean;
  canSendAgreement: boolean;
  canApprove: boolean;
  canProposeChange: boolean;
  canAcceptInvite: boolean;
  canDeliver: boolean;
  canRequestRevision: boolean;
  canConfirmCompletion: boolean;
  canPayDeposit: boolean;
  canPayBalance: boolean;
  canCancel: boolean;
  canDispute: boolean;
  canMessage: boolean;
  canExpressInterest: boolean;
}

export interface ProjectSummary {
  id: string;
  title: string;
  contentType: string;
  services: ServiceNeed;
  status: ProjectStatus;
  statusLabel: string;
  visibility: 'invite' | 'open';
  neighborhood: string;
  budgetCents: number;
  shootDate: string | null;
  deliveryDeadline: string | null;
  customer: { id: string; name: string };
  nextStep: NextStep;
  updatedAt: string;
  memberCount: number;
}

export interface ProjectDetail extends ProjectSummary {
  description: string;
  locationDetail: string;
  styleTags: string[];
  preferredDates: string[];
  members: ProjectMember[];
  accepted: BriefVersion | null;
  draft: BriefVersion | null;
  pending: BriefVersion | null;
  quote: QuoteView;
  payments: PaymentView[];
  payouts: PayoutView[];
  deliveries: DeliveryView[];
  revisions: RevisionView[];
  revisionsIncluded: number;
  revisionsUsed: number;
  messages: MessageView[];
  events: EventView[];
  reviews: ReviewItem[];
  reviewTargets: Array<{ userId: string; name: string; alreadyReviewed: boolean }>;
  disputeReason: string | null;
  permissions: Permissions;
  viewerUserId: string | null;
  interest: { status: MemberStatus; message: string } | null;
  /** Money paid by the customer that has not been refunded (deposit and balance). */
  paidCents: number;
  refundRequests: RefundRequestView[];
  /** The booking-time record. Null until the deposit is confirmed under a recorded policy acceptance. */
  booking: BookingRecordView | null;
  cancellation: CancellationPreview;
  policy: { refundVersion: string; termsVersion: string };
}

export type RefundReason = 'cancellation' | 'not_delivered' | 'quality';

export type RefundRequestStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'declined'
  | 'withdrawn'
  | 'refund_initiated'
  | 'refunded'
  | 'refund_failed'
  | 'not_required';

export type PolicyAuthorRole = 'customer' | 'creator' | 'platform';

export interface RefundNoteView {
  id: string;
  authorRole: PolicyAuthorRole;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface RefundEvidenceView {
  agreementVersionId: string | null;
  portfolio: Array<{ id: string; title: string }>;
  deliveries: Array<{ id: string; fileName: string }>;
  messages: Array<{ id: string; authorName: string; body: string; createdAt: string }>;
}

export interface RefundRequestView {
  id: string;
  reason: RefundReason;
  status: RefundRequestStatus;
  statusLabel: string;
  statusExplanation: string;
  /** The most the customer could receive when the request was made. */
  requestedCents: number | null;
  /** The amount approved for refund, once the request is decided. */
  approvedCents: number | null;
  /** Amount the payment provider has confirmed as refunded so far. */
  refundedCents: number;
  /** Set for cancellations: whether the 72-hour guarantee applied at the moment of cancelling. */
  qualifies72h: boolean | null;
  cancelledAt: string | null;
  scheduledStart: string | null;
  policyVersion: string;
  description: string;
  evidence: RefundEvidenceView;
  decision: { note: string; decidedAt: string | null; decidedBy: 'platform' | 'policy' } | null;
  notes: RefundNoteView[];
  createdAt: string;
  updatedAt: string;
  viewer: { canWithdraw: boolean; canAddNote: boolean; canRetry: boolean };
}

export interface BookingRecordView {
  policyVersion: string;
  termsVersion: string;
  acceptedAt: string | null;
  bookedAt: string;
  scheduledStart: string | null;
  paidCents: number;
  members: Array<{
    userId: string;
    name: string;
    packageName: string;
    priceCents: number;
    services: string[];
    portfolio: Array<{ id: string; title: string; kind: 'photo' | 'video' }>;
  }>;
}

export interface CancellationPreview {
  canCancel: boolean;
  paidCents: number;
  scheduledStart: string | null;
  deadline: string | null;
  hoursBeforeStart: number | null;
  /** Whether cancelling now would be covered by the 72-hour guarantee. Null when the start time is unknown. */
  qualifiesNow: boolean | null;
  outcome: 'no_payment' | 'full_refund_guarantee' | 'under_review' | 'unknown_start';
}

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  name: string;
  initials: string;
  bio: string;
  bioWords: number;
  isDemo: boolean;
  seekingClients: boolean | null;
}

export interface AppConfig {
  paymentMode: PaymentMode;
  stripePublishableKey: string | null;
  biographyMaxWords: number;
  customerFeeRate: number;
  creatorCommissionRate: number;
  depositRate: number;
  serviceArea: string;
  demoAccounts: Array<{ role: Role; label: string; email: string }>;
}
