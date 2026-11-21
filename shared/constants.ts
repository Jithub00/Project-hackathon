export const SERVICE_OPTIONS = [
  { value: 'photography', label: 'Photography' },
  { value: 'videography', label: 'Videography' },
  { value: 'both', label: 'Both photography and video' },
] as const;

export const SERVICE_KIND_LABEL: Record<'photography' | 'videography', string> = {
  photography: 'Photographer',
  videography: 'Videographer',
};

export const CONTENT_TYPES = [
  'Product & e-commerce',
  'Brand campaign',
  'Fashion & lookbook',
  'Real estate & architecture',
  'Food & hospitality',
  'Music & live events',
  'Social media content',
  'Personal or family project',
  'Other',
] as const;

export const STYLE_OPTIONS = [
  'Clean & bright',
  'Moody & cinematic',
  'Editorial',
  'Documentary',
  'Natural light',
  'Bold & graphic',
  'Architectural',
  'Warm & lifestyle',
  'Gritty & raw',
  'Minimal',
] as const;

export const CUSTOMER_INTEREST_OPTIONS = [
  'Brand campaigns',
  'Product photography',
  'Real estate',
  'Music videos',
  'Social content',
  'Events',
  'Food & hospitality',
  'Fashion & editorial',
  'Documentary',
  'Personal projects',
] as const;

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const;

export const USAGE_OPTIONS = [
  {
    value: 'portfolio',
    label: 'Portfolio and editorial only',
    description: 'The creator may show the work publicly. The client uses files internally and for editorial features.',
  },
  {
    value: 'social-web-12m',
    label: 'Web and social for 12 months',
    description: 'The client may publish the delivered files on websites and social channels for 12 months.',
  },
  {
    value: 'commercial-12m',
    label: 'Paid advertising for 12 months',
    description: 'The client may run the delivered files in paid advertising for 12 months. Covered by the agreed package prices.',
  },
] as const;

export const USAGE_LABEL: Record<string, string> = Object.fromEntries(
  USAGE_OPTIONS.map((o) => [o.value, o.label]),
);

export const PROJECT_STATUS_ORDER = [
  'draft',
  'recruiting',
  'agreement_pending',
  'agreed',
  'booked',
  'delivered',
  'revision_requested',
  'completed',
  'closed',
  'cancelled',
  'disputed',
] as const;

export const MIN_PACKAGE_CENTS = 5000;
export const MAX_PACKAGE_CENTS = 5_000_000;
export const BUDGET_OPTIONS_DOLLARS = [500, 1000, 2500, 5000, 10000] as const;

export const DEMO_PASSWORD_HINT = 'Demo-Password-2026';
