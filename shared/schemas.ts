import { z } from 'zod';
import { checkBiography } from './biography';
import { isLaNeighborhood } from './service-area';
import {
  CONTENT_TYPES,
  CUSTOMER_INTEREST_OPTIONS,
  MAX_PACKAGE_CENTS,
  MIN_PACKAGE_CENTS,
  STYLE_OPTIONS,
} from './constants';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .pipe(z.email('Enter a valid email address, like name@example.com.'));

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use 128 characters or fewer.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one number.');

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Enter at least 2 characters.')
  .max(80, 'Keep names under 80 characters.');

export const biographySchema = z
  .string()
  .max(12000, 'That is too long. Biographies are limited to 350 words.')
  .superRefine((value, ctx) => {
    const check = checkBiography(value);
    if (!check.ok) {
      ctx.addIssue({ code: 'custom', message: check.message });
    }
  });

export const laNeighborhoodSchema = z
  .string()
  .refine(isLaNeighborhood, { error: 'Choose a Los Angeles neighbourhood from the list.' });

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD date format.')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), { error: 'Enter a real calendar date.' });

export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Use a 24-hour time such as 09:30.');

const serviceNeedSchema = z.enum(['photography', 'videography', 'both'], {
  error: 'Choose photography, videography, or both.',
});

const passwordsMatch = (
  value: { password: string; confirmPassword: string },
  ctx: z.RefinementCtx,
) => {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' });
  }
};

export const customerSignupSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    customerType: z.enum(['individual', 'business'], { error: 'Choose individual or business.' }),
    businessName: z.string().trim().max(120, 'Keep business names under 120 characters.').default(''),
    neighborhood: z.union([z.literal(''), laNeighborhoodSchema]).default(''),
    interests: z.array(z.enum(CUSTOMER_INTEREST_OPTIONS)).max(10).default([]),
    bio: biographySchema.default(''),
    acceptTerms: z.literal(true, { error: 'Accept the terms to create your account.' }),
  })
  .superRefine((value, ctx) => {
    passwordsMatch(value, ctx);
    if (value.customerType === 'business' && !value.businessName) {
      ctx.addIssue({ code: 'custom', path: ['businessName'], message: 'Enter your business name.' });
    }
  });

export const creatorSignupSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    services: serviceNeedSchema,
    specialties: z
      .array(z.string().trim().min(2, 'Each specialty needs at least 2 characters.').max(40))
      .min(1, 'Add at least one specialty.')
      .max(8, 'Add up to 8 specialties.'),
    styles: z.array(z.enum(STYLE_OPTIONS)).min(1, 'Choose at least one style.').max(4, 'Choose up to 4 styles.'),
    neighborhoods: z.array(laNeighborhoodSchema).default([]),
    citywide: z.boolean().default(false),
    packageService: z.enum(['photography', 'videography'], { error: 'Choose the service for your first package.' }),
    packageName: z.string().trim().min(3, 'Name your first package (at least 3 characters).').max(80),
    packageHours: z.number({ error: 'Enter the hours included.' }).min(0.5, 'Enter at least half an hour.').max(24),
    packagePriceCents: z
      .number({ error: 'Enter a package price.' })
      .int()
      .min(MIN_PACKAGE_CENTS, 'Packages start at $50.')
      .max(MAX_PACKAGE_CENTS, 'Packages can be up to $50,000.'),
    bio: biographySchema.default(''),
    seekingClients: z.boolean().default(true),
    acceptTerms: z.literal(true, { error: 'Accept the terms to create your account.' }),
  })
  .superRefine((value, ctx) => {
    passwordsMatch(value, ctx);
    if (!value.citywide && value.neighborhoods.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['neighborhoods'],
        message: 'Choose at least one neighbourhood, or All of Los Angeles.',
      });
    }
    if (value.services !== 'both' && value.packageService !== value.services) {
      ctx.addIssue({
        code: 'custom',
        path: ['packageService'],
        message: 'Your first package must match the service you offer.',
      });
    }
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const basicsSchema = z.object({
  name: nameSchema,
  bio: biographySchema,
});

export const creatorProfileSchema = z
  .object({
    services: serviceNeedSchema,
    specialties: z
      .array(z.string().trim().min(2, 'Each specialty needs at least 2 characters.').max(40))
      .min(1, 'Add at least one specialty.')
      .max(8, 'Add up to 8 specialties.'),
    styles: z.array(z.enum(STYLE_OPTIONS)).min(1, 'Choose at least one style.').max(4, 'Choose up to 4 styles.'),
    neighborhoods: z.array(laNeighborhoodSchema).max(60),
    citywide: z.boolean(),
    seekingClients: z.boolean(),
    yearsExperience: z.number().int().min(0).max(60),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    typicalHours: z
      .string()
      .regex(/^(\d{2}:\d{2}-\d{2}:\d{2})?$/, 'Use HH:MM-HH:MM, for example 09:00-17:00.')
      .default(''),
  })
  .superRefine((value, ctx) => {
    if (!value.citywide && value.neighborhoods.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['neighborhoods'],
        message: 'Choose at least one neighbourhood, or All of Los Angeles.',
      });
    }
  });

export const packageSchema = z.object({
  id: z.string().optional(),
  service: z.enum(['photography', 'videography']),
  name: z.string().trim().min(3, 'Name the package (at least 3 characters).').max(80),
  hours: z.number({ error: 'Enter the hours included.' }).min(0.5, 'Enter at least half an hour.').max(24),
  priceCents: z
    .number({ error: 'Enter a package price.' })
    .int()
    .min(MIN_PACKAGE_CENTS, 'Packages start at $50.')
    .max(MAX_PACKAGE_CENTS, 'Packages can be up to $50,000.'),
  deliverables: z.string().trim().max(400).default(''),
});

export const packagesSchema = z.object({
  packages: z.array(packageSchema).max(8),
});

export const portfolioItemSchema = z.object({
  kind: z.enum(['photo', 'video']),
  title: z.string().trim().min(3, 'Give the work a title (at least 3 characters).').max(90),
  contribution: z.string().trim().max(600, 'Keep contribution notes under 600 characters.').default(''),
  projectLabel: z.string().trim().max(120).default(''),
  mediaUrl: z.string().min(1).max(500),
  posterUrl: z.string().max(500).nullable().optional(),
});

export const availabilitySchema = z.object({
  dates: z.array(isoDateSchema).max(366),
});

export const customerProfileSchema = z
  .object({
    customerType: z.enum(['individual', 'business']),
    businessName: z.string().trim().max(120).default(''),
    interests: z.array(z.enum(CUSTOMER_INTEREST_OPTIONS)).max(10).default([]),
    neighborhood: z.union([z.literal(''), laNeighborhoodSchema]).default(''),
  })
  .superRefine((value, ctx) => {
    if (value.customerType === 'business' && !value.businessName) {
      ctx.addIssue({ code: 'custom', path: ['businessName'], message: 'Enter your business name.' });
    }
  });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' });
    }
  });

export const projectCreateSchema = z.object({
  title: z.string().trim().min(3, 'Give the project a short title (at least 3 characters).').max(120),
  contentType: z.enum(CONTENT_TYPES, { error: 'Choose the type of content.' }),
  services: serviceNeedSchema,
  budgetCents: z
    .number({ error: 'Enter a total budget.' })
    .int()
    .min(5000, 'Budgets start at $50.')
    .max(10_000_000, 'Budgets above $100,000 need a custom quote.'),
  neighborhood: laNeighborhoodSchema,
  locationDetail: z.string().trim().max(200).default(''),
  styleTags: z.array(z.enum(STYLE_OPTIONS)).max(4).default([]),
  preferredDates: z.array(isoDateSchema).max(5).default([]),
  description: z.string().trim().max(2000).default(''),
  visibility: z.enum(['invite', 'open']).default('invite'),
  invites: z
    .array(z.object({ creatorId: z.string().min(1), packageId: z.string().min(1) }))
    .max(6)
    .default([]),
  photoCount: z.number().int().min(0).max(500).default(40),
  videoCount: z.number().int().min(0).max(20).default(0),
  videoLengthSeconds: z.number().int().min(0).max(900).default(60),
  deliveryDeadline: isoDateSchema.optional(),
  includedRevisions: z.number().int().min(0).max(5).default(2),
  usageRights: z.enum(['portfolio', 'social-web-12m', 'commercial-12m']).default('social-web-12m'),
});

export const briefDraftSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the project a title (at least 3 characters).').max(120),
    goals: z.string().trim().min(10, 'Describe the project goals (at least 10 characters).').max(2000),
    creativeDirection: z.string().trim().max(2000).default(''),
    shootDate: isoDateSchema,
    shootStartTime: timeSchema,
    durationHours: z.number().min(1, 'Plan at least one hour on location.').max(24),
    neighborhood: laNeighborhoodSchema,
    locationDetail: z.string().trim().max(200).default(''),
    photoCount: z.number().int().min(0).max(500),
    video: z.object({
      count: z.number().int().min(0).max(20),
      lengthSeconds: z.number().int().min(0).max(900),
    }),
    otherDeliverables: z.string().trim().max(500).default(''),
    editingRequirements: z.string().trim().max(2000).default(''),
    includedRevisions: z.number().int().min(0).max(5),
    deliveryDeadline: isoDateSchema,
    usageRights: z.enum(['portfolio', 'social-web-12m', 'commercial-12m']),
    members: z
      .array(
        z.object({
          userId: z.string().min(1),
          packageId: z.string().min(1),
          responsibilities: z.string().trim().max(800).default(''),
        }),
      )
      .max(6),
  })
  .superRefine((value, ctx) => {
    if (value.photoCount === 0 && value.video.count === 0 && !value.otherDeliverables) {
      ctx.addIssue({
        code: 'custom',
        path: ['photoCount'],
        message: 'Include at least one photo quantity, video, or other deliverable.',
      });
    }
    if (value.video.count > 0 && value.video.lengthSeconds < 10) {
      ctx.addIssue({ code: 'custom', path: ['video', 'lengthSeconds'], message: 'Video length should be at least 10 seconds.' });
    }
  });

export const reviewSchema = z.object({
  revieweeId: z.string().min(1, 'Choose who you are reviewing.'),
  communication: z.number().int().min(1).max(5),
  reliability: z.number().int().min(1).max(5),
  professionalism: z.number().int().min(1).max(5),
  quality: z.number().int().min(1).max(5),
  expectationsMet: z.boolean(),
  body: z
    .string()
    .trim()
    .min(20, 'Write at least 20 characters so others understand your experience.')
    .max(1200, 'Keep reviews under 1,200 characters.'),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first.').max(2000, 'Keep messages under 2,000 characters.'),
});

export const interestSchema = z.object({
  message: z.string().trim().max(500).default(''),
});

export const inviteSchema = z.object({
  creatorId: z.string().min(1),
  packageId: z.string().min(1),
});

/** Accepting an invitation records the creator's acceptance of the current policy and terms versions. */
export const respondSchema = z.object({
  action: z.enum(['accept', 'decline']),
  acceptedRefundPolicyVersion: z.string().max(20).optional(),
  acceptedTermsVersion: z.string().max(20).optional(),
});

/** Paying the deposit requires the customer to accept the current policy and terms. The balance needs no acceptance. */
export const checkoutSchema = z.object({
  kind: z.enum(['deposit', 'balance']).default('deposit'),
  acceptedRefundPolicyVersion: z.string().max(20).optional(),
  acceptedTermsVersion: z.string().max(20).optional(),
});

export const deliverySchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  fileUrl: z.string().min(1).max(500),
  kind: z.enum(['photo', 'video', 'other']),
  sizeBytes: z.number().int().min(0).max(10_000_000_000),
  note: z.string().trim().max(500).default(''),
});

export const revisionRequestSchema = z.object({
  notes: z.string().trim().min(10, 'Describe the revision (at least 10 characters).').max(1500),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(5, 'Tell us why (at least 5 characters).').max(500),
});

export const disputeSchema = z.object({
  reason: z.string().trim().min(20, 'Describe the issue (at least 20 characters).').max(2000),
});

/** A delivery or quality refund request. Cancellations use reasonSchema through the cancel route. */
export const refundRequestSchema = z.object({
  reason: z.enum(['not_delivered', 'quality'], { error: 'Choose the reason for the request.' }),
  description: z.string().trim().min(20, 'Describe the problem (at least 20 characters).').max(3000),
  portfolioItemIds: z.array(z.string().min(1).max(64)).max(20).default([]),
  deliveryIds: z.array(z.string().min(1).max(64)).max(50).default([]),
  messageIds: z.array(z.string().min(1).max(64)).max(50).default([]),
});

export const refundNoteSchema = z.object({
  body: z.string().trim().min(5, 'Add a few more words (at least 5 characters).').max(2000),
});

export const refundDecisionSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  amountCents: z.number().int().min(1).max(100_000_000).optional(),
  note: z.string().trim().min(10, 'Give the reasons for the decision (at least 10 characters).').max(2000),
});

export const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().min(3).max(100),
  dataUrl: z.string().min(20),
});

export type CustomerSignupInput = z.infer<typeof customerSignupSchema>;
export type CreatorSignupInput = z.infer<typeof creatorSignupSchema>;
export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>;
export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;
export type PackageInput = z.infer<typeof packageSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type BriefDraftInput = z.infer<typeof briefDraftSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
