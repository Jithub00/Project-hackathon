import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import path from 'node:path';
import { all, get, newId, nowIso, parseJsonArray, run, todayIso, transaction, type Db } from '../db';
import { HttpError, conflict, forbidden, notFound, parseBody, route } from '../http';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  readCookie,
  requireRole,
  requireUser,
  sessionKeyFor,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
  type AuthUser,
} from '../auth';
import { checkBiography, countWords } from '../../shared/biography';
import { isLaNeighborhood, SERVICE_AREA_NAME, LA_NEIGHBORHOOD_NAMES } from '../../shared/service-area';
import { STYLE_OPTIONS, BUDGET_OPTIONS_DOLLARS } from '../../shared/constants';
import {
  availabilitySchema,
  basicsSchema,
  creatorProfileSchema,
  creatorSignupSchema,
  customerProfileSchema,
  customerSignupSchema,
  deliverySchema,
  disputeSchema,
  inviteSchema,
  interestSchema,
  loginSchema,
  messageSchema,
  packagesSchema,
  passwordChangeSchema,
  portfolioItemSchema,
  projectCreateSchema,
  reasonSchema,
  respondSchema,
  checkoutSchema,
  refundDecisionSchema,
  refundNoteSchema,
  refundRequestSchema,
  revisionRequestSchema,
  reviewSchema,
  briefDraftSchema,
  uploadSchema,
} from '../../shared/schemas';
import type { DiscoveryCriteria, SessionUser, AppConfig, ServiceNeed } from '../../shared/types';
import { type PaymentProvider, resolvePaymentMode, constructStripeEvent, refundOutcomeFromStripe } from '../payments/provider';
import { initialsFor, getCreatorRow, getCustomerRow, getUserRow, insertUser, touchUser, buildCreatorProfile, buildCustomerProfile, listPackages, listPortfolio, type UserRow } from '../domain/people';
import { discover } from '../domain/discovery';
import { listOpenCalls, listProjectsFor, buildDetail, createProject, updateDraft, sendAgreement, withdrawAgreement, approveVersion, inviteMember, removeMember, setMemberResponse, expressInterest, postMessage, addDelivery, requestRevision, confirmCompletion, openDispute, createReview, requireProject } from '../domain/projects';
import { startCheckout, demoConfirm, syncPayment, applyProviderEvent } from '../domain/payments';
import {
  addRefundNote,
  applyRefundEvent,
  cancelProject,
  decideRefundRequest,
  refundReviewQueue,
  retryRefund,
  submitRefundRequest,
  withdrawRefundRequest,
} from '../domain/refunds';
import { currentVersions, recordPolicyAcceptance, requireCurrentPolicy } from '../domain/policy';
import { saveUpload } from '../uploads';
import { MessageHub } from '../messaging/hub';
import { createGuards, limitsFromEnv, type MessagingLimits } from '../messaging/limits';
import { allowedOriginsFromEnv } from '../messaging/origin';
import { createMessagingRouter, createModerationRouter } from './messages';

export interface AppContext {
  db: Db;
  provider: PaymentProvider;
  env: NodeJS.ProcessEnv;
  uploadsDir: string;
  /** Shared stream registry. Created automatically when omitted. */
  hub?: MessageHub;
  /** Overrides the limits read from the environment. Used by tests. */
  messagingLimits?: Partial<MessagingLimits>;
  /** How often open message streams re-check their session. Used by tests. */
  streamRevalidateMs?: number;
}

function sessionUser(db: Db, user: AuthUser): SessionUser {
  const creator = user.role === 'creator' ? getCreatorRow(db, user.id) : undefined;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    initials: initialsFor(user.name),
    bio: user.bio,
    bioWords: countWords(user.bio),
    isDemo: user.is_demo === 1,
    seekingClients: creator ? creator.seeking_clients === 1 : null,
  };
}

function authUserById(db: Db, id: string): AuthUser {
  const user = getUserRow(db, id);
  if (!user) throw notFound('Account not found.');
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    bio: user.bio,
    is_demo: user.is_demo,
  };
}

/** Rejects over-long biographies with a precise code before schema validation runs. */
function preflightBiography(body: unknown): void {
  if (!body || typeof body !== 'object' || !('bio' in body)) return;
  const bio = (body as { bio?: unknown }).bio;
  if (typeof bio !== 'string') return;
  const check = checkBiography(bio);
  if (!check.ok) {
    throw new HttpError(422, check.message, 'BIO_TOO_LONG', { bio: check.message });
  }
}

function ensureEmailFree(db: Db, email: string): void {
  if (get(db, 'SELECT 1 FROM users WHERE email = ?', email)) {
    throw new HttpError(409, 'An account with this email already exists. Log in instead.', 'EMAIL_TAKEN', {
      email: 'An account with this email already exists.',
    });
  }
}

function criteriaFromQuery(query: Record<string, unknown>): DiscoveryCriteria {
  const rawServices = typeof query.services === 'string' ? query.services : 'any';
  const services: ServiceNeed | 'any' = (['photography', 'videography', 'both'] as const).includes(rawServices as ServiceNeed)
    ? (rawServices as ServiceNeed)
    : 'any';
  let neighborhood: string | null = null;
  if (typeof query.neighborhood === 'string' && query.neighborhood !== '') {
    if (!isLaNeighborhood(query.neighborhood)) {
      throw new HttpError(400, `Photo Shoot only serves ${SERVICE_AREA_NAME} neighbourhoods.`, 'OUTSIDE_SERVICE_AREA', {
        neighborhood: 'Choose a Los Angeles neighbourhood.',
      });
    }
    neighborhood = query.neighborhood;
  }
  const budget = typeof query.budget === 'string' ? Number(query.budget) : NaN;
  const budgetCents = Number.isFinite(budget) && budget > 0 ? Math.round(budget * 100) : null;
  const styles = typeof query.styles === 'string'
    ? query.styles.split(',').map((s) => s.trim()).filter((s): s is (typeof STYLE_OPTIONS)[number] => (STYLE_OPTIONS as readonly string[]).includes(s))
    : [];
  const date = typeof query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : null;
  const rating = typeof query.minRating === 'string' ? Number(query.minRating) : NaN;
  const minRating = Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null;
  const sort = query.sort === 'rating' || query.sort === 'price' ? query.sort : 'best';
  return { services, neighborhood, budgetCents, styles, date, minRating, sort };
}

function mediaUrlAllowed(url: string): boolean {
  return url.startsWith('/uploads/') || url.startsWith('/images/samples/');
}

function completenessFor(db: Db, user: AuthUser): Array<{ label: string; done: boolean; href: string }> {
  if (user.role === 'creator') {
    const profile = getCreatorRow(db, user.id);
    const portfolio = listPortfolio(db, user.id);
    const packages = listPackages(db, user.id);
    const availability = get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM availability_dates WHERE creator_id = ?', user.id)?.count ?? 0;
    const weekdays = profile ? parseJsonArray<number>(profile.weekdays) : [];
    return [
      { label: 'Biography written', done: countWords(user.bio) > 0, href: '/account/profile' },
      { label: 'Service area set', done: Boolean(profile && (profile.citywide === 1 || parseJsonArray(profile.neighborhoods).length > 0)), href: '/account/profile' },
      { label: 'Packages with clear prices', done: packages.length > 0, href: '/account/profile' },
      { label: 'Portfolio: at least 3 items', done: portfolio.length >= 3, href: '/account/profile' },
      { label: 'Availability set', done: weekdays.length > 0 || availability > 0, href: '/account/profile' },
    ];
  }
  const profile = getCustomerRow(db, user.id);
  return [
    { label: 'Biography written', done: countWords(user.bio) > 0, href: '/account/profile' },
    { label: 'Business or personal details', done: Boolean(profile && (profile.customer_type === 'individual' || profile.business_name)), href: '/account/profile' },
    { label: 'Preferred Los Angeles neighbourhood', done: Boolean(profile?.neighborhood), href: '/account/profile' },
    { label: 'Content interests chosen', done: parseJsonArray(profile?.interests ?? '[]').length > 0, href: '/account/profile' },
  ];
}

export function buildConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    paymentMode: resolvePaymentMode(env),
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY ?? null,
    biographyMaxWords: 350,
    customerFeeRate: 0.08,
    creatorCommissionRate: 0.1,
    depositRate: 0.3,
    serviceArea: SERVICE_AREA_NAME,
    demoAccounts: [
      { role: 'customer', label: 'Customer: Harbor & Pine Studio', email: 'studio@example.com' },
      { role: 'customer', label: 'Customer: Northline Realty', email: 'realty@example.com' },
      { role: 'creator', label: 'Creator: Marisol Vega, photographer', email: 'marisol@example.com' },
      { role: 'creator', label: 'Creator: Devon Park, videographer', email: 'devon@example.com' },
    ],
  };
}

export function registerApi(app: Express, ctx: AppContext): void {
  const { db, provider, env, uploadsDir } = ctx;
  const api = express.Router();
  const hub = ctx.hub ?? new MessageHub();
  const guards = createGuards({ ...limitsFromEnv(env), ...ctx.messagingLimits });
  const allowedOrigins = allowedOriginsFromEnv(env);
  // Addresses reserved for platform reviewers. They cannot be used to sign up, so nobody can register a reviewer's
  // address ahead of its owner. Reviewer access is granted only by the startup bootstrap (server/domain/staff.ts).
  const reservedEmails = new Set(
    (env.MODERATOR_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );

  const rejectReservedEmail = (email: string): void => {
    if (reservedEmails.has(email.trim().toLowerCase())) {
      throw new HttpError(409, 'That email address cannot be used to create an account.', 'EMAIL_RESERVED', {
        email: 'That email address cannot be used.',
      });
    }
  };

  /**
   * Starts a new session. Any session already on this browser is destroyed first, so signing in as another
   * account never keeps the previous account's access or open message streams.
   */
  const startSession = (req: Request, res: Response, userId: string): void => {
    const previous = readCookie(req, SESSION_COOKIE);
    if (previous) {
      destroySession(db, previous);
      hub.closeSession(sessionKeyFor(previous));
    }
    const { token, expiresAt } = createSession(db, userId);
    setSessionCookie(res, token, expiresAt);
  };

  api.get('/config', (_req, res) => {
    res.json({ ...buildConfig(env), neighborhoods: LA_NEIGHBORHOOD_NAMES, budgets: BUDGET_OPTIONS_DOLLARS });
  });

  /* ---------------- Auth ---------------- */

  api.post('/auth/signup/customer', route((req, res) => {
    preflightBiography(req.body);
    const input = parseBody(customerSignupSchema, req.body);
    rejectReservedEmail(input.email);
    ensureEmailFree(db, input.email);
    const id = transaction(db, () => {
      const userId = insertUser(db, {
        email: input.email,
        passwordHash: hashPassword(input.password),
        role: 'customer',
        name: input.name,
        bio: input.bio,
      });
      run(
        db,
        'INSERT INTO customer_profiles (user_id, customer_type, business_name, interests, neighborhood, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        userId,
        input.customerType,
        input.businessName,
        JSON.stringify(input.interests),
        input.neighborhood,
        nowIso(),
      );
      return userId;
    });
    recordPolicyAcceptance(db, id, null, 'signup_customer', currentVersions());
    startSession(req, res, id);
    res.status(201).json({ user: sessionUser(db, authUserById(db, id)) });
  }));

  api.post('/auth/signup/creator', route((req, res) => {
    preflightBiography(req.body);
    const input = parseBody(creatorSignupSchema, req.body);
    rejectReservedEmail(input.email);
    ensureEmailFree(db, input.email);
    const id = transaction(db, () => {
      const userId = insertUser(db, {
        email: input.email,
        passwordHash: hashPassword(input.password),
        role: 'creator',
        name: input.name,
        bio: input.bio,
      });
      run(
        db,
        `INSERT INTO creator_profiles (user_id, services, specialties, styles, neighborhoods, citywide, seeking_clients, years_experience, weekdays, typical_hours, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, '[]', '', ?)`,
        userId,
        input.services,
        JSON.stringify(input.specialties),
        JSON.stringify(input.styles),
        JSON.stringify(input.neighborhoods),
        input.citywide ? 1 : 0,
        input.seekingClients ? 1 : 0,
        nowIso(),
      );
      run(
        db,
        'INSERT INTO creator_packages (id, creator_id, service, name, hours, price_cents, deliverables, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
        newId(),
        userId,
        input.packageService,
        input.packageName,
        input.packageHours,
        input.packagePriceCents,
        '',
      );
      return userId;
    });
    recordPolicyAcceptance(db, id, null, 'signup_creator', currentVersions());
    startSession(req, res, id);
    res.status(201).json({ user: sessionUser(db, authUserById(db, id)) });
  }));

  api.post('/auth/login', route((req, res) => {
    const input = parseBody(loginSchema, req.body);
    const user = get<UserRow>(db, 'SELECT * FROM users WHERE email = ?', input.email);
    if (!user || !verifyPassword(input.password, user.password_hash)) {
      throw new HttpError(401, 'That email and password do not match our records.', 'BAD_CREDENTIALS');
    }
    startSession(req, res, user.id);
    res.json({ user: sessionUser(db, authUserById(db, user.id)) });
  }));

  api.post('/auth/logout', route((req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      destroySession(db, token);
      hub.closeSession(sessionKeyFor(token));
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  }));

  api.get('/auth/me', (req, res) => {
    res.json({ user: req.user ? sessionUser(db, req.user) : null });
  });

  /* ---------------- Account ---------------- */

  api.get('/me/dashboard', requireUser, route((req, res) => {
    const user = req.user as AuthUser;
    const row = getUserRow(db, user.id) as UserRow;
    const projects = listProjectsFor(db, row);
    const opportunities = user.role === 'creator'
      ? listOpenCalls(db, user.id, {}).filter((p) => p.interest === null).length
      : 0;
    res.json({
      user: sessionUser(db, user),
      projects,
      opportunities,
      checklist: completenessFor(db, user),
    });
  }));

  api.get('/me/profile', requireUser, route((req, res) => {
    const user = req.user as AuthUser;
    const profile = user.role === 'creator' ? buildCreatorProfile(db, user.id) : buildCustomerProfile(db, user.id);
    res.json({ user: sessionUser(db, user), profile, checklist: completenessFor(db, user) });
  }));

  api.put('/me/profile', requireUser, route((req, res) => {
    preflightBiography(req.body);
    const input = parseBody(basicsSchema, req.body);
    const user = req.user as AuthUser;
    touchUser(db, user.id, { name: input.name, bio: input.bio });
    res.json({ user: sessionUser(db, authUserById(db, user.id)) });
  }));

  api.put('/me/creator-profile', requireRole('creator'), route((req, res) => {
    const input = parseBody(creatorProfileSchema, req.body);
    const user = req.user as AuthUser;
    run(
      db,
      `UPDATE creator_profiles SET services = ?, specialties = ?, styles = ?, neighborhoods = ?, citywide = ?, seeking_clients = ?,
         years_experience = ?, weekdays = ?, typical_hours = ?, updated_at = ? WHERE user_id = ?`,
      input.services,
      JSON.stringify(input.specialties),
      JSON.stringify(input.styles),
      JSON.stringify(input.neighborhoods),
      input.citywide ? 1 : 0,
      input.seekingClients ? 1 : 0,
      input.yearsExperience,
      JSON.stringify(input.weekdays),
      input.typicalHours,
      nowIso(),
      user.id,
    );
    res.json({ profile: buildCreatorProfile(db, user.id) });
  }));

  api.put('/me/customer-profile', requireRole('customer'), route((req, res) => {
    const input = parseBody(customerProfileSchema, req.body);
    const user = req.user as AuthUser;
    run(
      db,
      'UPDATE customer_profiles SET customer_type = ?, business_name = ?, interests = ?, neighborhood = ?, updated_at = ? WHERE user_id = ?',
      input.customerType,
      input.businessName,
      JSON.stringify(input.interests),
      input.neighborhood,
      nowIso(),
      user.id,
    );
    res.json({ profile: buildCustomerProfile(db, user.id) });
  }));

  api.put('/me/packages', requireRole('creator'), route((req, res) => {
    const input = parseBody(packagesSchema, req.body);
    const user = req.user as AuthUser;
    transaction(db, () => {
      const existing = all<{ id: string }>(db, 'SELECT id FROM creator_packages WHERE creator_id = ?', user.id).map((r) => r.id);
      const keep = new Set(input.packages.map((p) => p.id).filter((id): id is string => Boolean(id)));
      for (const id of existing) {
        if (!keep.has(id)) {
          run(db, 'DELETE FROM creator_packages WHERE id = ? AND creator_id = ?', id, user.id);
        }
      }
      input.packages.forEach((pkg, index) => {
        if (pkg.id && existing.includes(pkg.id)) {
          run(
            db,
            'UPDATE creator_packages SET service = ?, name = ?, hours = ?, price_cents = ?, deliverables = ?, sort_order = ? WHERE id = ? AND creator_id = ?',
            pkg.service,
            pkg.name,
            pkg.hours,
            pkg.priceCents,
            pkg.deliverables,
            index,
            pkg.id,
            user.id,
          );
        } else {
          run(
            db,
            'INSERT INTO creator_packages (id, creator_id, service, name, hours, price_cents, deliverables, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            newId(),
            user.id,
            pkg.service,
            pkg.name,
            pkg.hours,
            pkg.priceCents,
            pkg.deliverables,
            index,
          );
        }
      });
    });
    res.json({ packages: listPackages(db, user.id) });
  }));

  api.post('/me/portfolio', requireRole('creator'), route((req, res) => {
    const input = parseBody(portfolioItemSchema, req.body);
    if (!mediaUrlAllowed(input.mediaUrl) || (input.posterUrl && !mediaUrlAllowed(input.posterUrl))) {
      throw new HttpError(400, 'Upload the file first, then add it to your portfolio.', 'BAD_MEDIA');
    }
    const user = req.user as AuthUser;
    const count = get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM portfolio_items WHERE creator_id = ?', user.id)?.count ?? 0;
    if (count >= 60) throw conflict('Portfolios can hold up to 60 items. Remove one to add another.', 'PORTFOLIO_FULL');
    run(
      db,
      `INSERT INTO portfolio_items (id, creator_id, kind, title, contribution, media_url, poster_url, project_label, is_demo, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      newId(),
      user.id,
      input.kind,
      input.title,
      input.contribution,
      input.mediaUrl,
      input.posterUrl ?? null,
      input.projectLabel,
      count,
      nowIso(),
    );
    res.status(201).json({ portfolio: listPortfolio(db, user.id) });
  }));

  api.delete('/me/portfolio/:id', requireRole('creator'), route((req, res) => {
    const user = req.user as AuthUser;
    const info = db.prepare('DELETE FROM portfolio_items WHERE id = ? AND creator_id = ? AND is_demo = 0').run(String(req.params.id), user.id);
    if (info.changes === 0) throw notFound('That portfolio item could not be found, or it is a demonstration item.');
    res.json({ portfolio: listPortfolio(db, user.id) });
  }));

  api.put('/me/availability', requireRole('creator'), route((req, res) => {
    const input = parseBody(availabilitySchema, req.body);
    const user = req.user as AuthUser;
    const today = todayIso();
    const booked = new Set(buildCreatorProfile(db, user.id)?.bookedDates ?? []);
    const dates = [...new Set(input.dates)].filter((d) => d >= today).sort();
    const clash = dates.find((d) => booked.has(d));
    if (clash) {
      throw new HttpError(409, `${clash} is already booked on a confirmed project. Pick a different date.`, 'DATE_BOOKED', { dates: `${clash} is booked.` });
    }
    transaction(db, () => {
      run(db, 'DELETE FROM availability_dates WHERE creator_id = ?', user.id);
      for (const date of dates) {
        run(db, 'INSERT INTO availability_dates (creator_id, date) VALUES (?, ?)', user.id, date);
      }
    });
    res.json({ profile: buildCreatorProfile(db, user.id) });
  }));

  api.put('/me/seeking', requireRole('creator'), route((req, res) => {
    const seeking = Boolean((req.body as { seeking?: unknown })?.seeking);
    run(db, 'UPDATE creator_profiles SET seeking_clients = ?, updated_at = ? WHERE user_id = ?', seeking ? 1 : 0, nowIso(), (req.user as AuthUser).id);
    res.json({ seekingClients: seeking });
  }));

  api.post('/me/password', requireUser, route((req, res) => {
    const input = parseBody(passwordChangeSchema, req.body);
    const user = req.user as AuthUser;
    const row = getUserRow(db, user.id) as UserRow;
    if (!verifyPassword(input.currentPassword, row.password_hash)) {
      throw new HttpError(400, 'Your current password is incorrect.', 'BAD_PASSWORD', { currentPassword: 'That is not your current password.' });
    }
    run(db, 'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(input.newPassword), nowIso(), user.id);
    // A password change ends every other session for the account, including streams opened from them.
    const keepToken = readCookie(req, SESSION_COOKIE);
    const keepKey = keepToken ? sessionKeyFor(keepToken) : '';
    run(db, 'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', user.id, keepKey);
    hub.closeUserExcept(user.id, keepKey);
    res.json({ ok: true });
  }));

  /* ---------------- Public discovery ---------------- */

  api.get('/creators', route((req, res) => {
    const criteria = criteriaFromQuery(req.query as Record<string, unknown>);
    res.json(discover(db, criteria));
  }));

  api.get('/creators/:id', route((req, res) => {
    const profile = buildCreatorProfile(db, String(req.params.id));
    if (!profile) throw notFound('We could not find that creator.');
    res.json({ profile });
  }));

  api.get('/customers/:id', route((req, res) => {
    const profile = buildCustomerProfile(db, String(req.params.id));
    if (!profile) throw notFound('We could not find that customer.');
    res.json({ profile });
  }));

  api.get('/featured', route((_req, res) => {
    const items = all<{
      id: string;
      kind: 'photo' | 'video';
      title: string;
      media_url: string;
      poster_url: string | null;
      project_label: string;
      creator_id: string;
      creator_name: string;
    }>(
      db,
      `SELECT p.id, p.kind, p.title, p.media_url, p.poster_url, p.project_label, p.creator_id, u.name AS creator_name
         FROM portfolio_items p JOIN users u ON u.id = p.creator_id
        WHERE p.is_demo = 1 AND p.kind = 'photo'
        ORDER BY u.name, p.sort_order LIMIT 8`,
    );
    res.json({
      items: items.map((i) => ({
        id: i.id,
        kind: i.kind,
        title: i.title,
        mediaUrl: i.media_url,
        posterUrl: i.poster_url,
        projectLabel: i.project_label,
        creatorId: i.creator_id,
        creatorName: i.creator_name,
        isDemo: true,
      })),
    });
  }));

  api.get('/opportunities', route((req, res) => {
    const criteria = criteriaFromQuery(req.query as Record<string, unknown>);
    const viewer = req.user?.id ?? null;
    res.json({
      projects: listOpenCalls(db, viewer, {
        services: criteria.services,
        neighborhood: criteria.neighborhood,
        budgetCents: criteria.budgetCents,
      }),
    });
  }));

  /* ---------------- Projects ---------------- */

  api.get('/projects', requireUser, route((req, res) => {
    res.json({ projects: listProjectsFor(db, getUserRow(db, (req.user as AuthUser).id) as UserRow) });
  }));

  api.post('/projects', requireRole('customer'), route((req, res) => {
    const input = parseBody(projectCreateSchema, req.body);
    const customer = getUserRow(db, (req.user as AuthUser).id) as UserRow;
    res.status(201).json({ project: createProject(db, customer, input) });
  }));

  api.get('/projects/:id', requireUser, route((req, res) => {
    const user = req.user as AuthUser;
    const project = requireProject(db, String(req.params.id));
    const detail = buildDetail(db, project, user.id);
    if (!detail.permissions.viewerRole) throw forbidden('Only the customer and team members can open this project.');
    res.json({ project: detail });
  }));

  const withUser = (handler: (user: UserRow, req: Request) => unknown | Promise<unknown>) =>
    route(async (req, res) => {
      const user = getUserRow(db, (req.user as AuthUser).id) as UserRow;
      const result = await handler(user, req);
      res.json({ project: result });
    });

  api.put('/projects/:id/draft', requireUser, withUser((user, req) => {
    const input = parseBody(briefDraftSchema, req.body);
    return updateDraft(db, user, String(req.params.id), input);
  }));

  api.post('/projects/:id/members', requireUser, withUser((user, req) => {
    const input = parseBody(inviteSchema, req.body);
    return inviteMember(db, user, String(req.params.id), input.creatorId, input.packageId);
  }));

  api.delete('/projects/:id/members/:creatorId', requireUser, withUser((user, req) => {
    return removeMember(db, user, String(req.params.id), String(req.params.creatorId));
  }));

  api.post('/projects/:id/interest', requireRole('creator'), withUser((user, req) => {
    const input = parseBody(interestSchema, req.body);
    return expressInterest(db, user, String(req.params.id), input.message);
  }));

  api.post('/projects/:id/respond', requireRole('creator'), withUser((user, req) => {
    const input = parseBody(respondSchema, req.body);
    // Accepting an invitation records the creator's acceptance of the current Refund and Cancellation Policy and Terms.
    const acceptance = input.action === 'accept' ? requireCurrentPolicy(input) : undefined;
    return setMemberResponse(db, user, String(req.params.id), input.action, acceptance);
  }));

  api.post('/projects/:id/send', requireRole('customer'), withUser((user, req) => {
    return sendAgreement(db, user, String(req.params.id));
  }));

  api.post('/projects/:id/versions/:versionId/withdraw', requireRole('customer'), withUser((user, req) => {
    return withdrawAgreement(db, user, String(req.params.id), String(req.params.versionId));
  }));

  api.post('/projects/:id/versions/:versionId/approve', requireUser, withUser((user, req) => {
    return approveVersion(db, user, String(req.params.id), String(req.params.versionId));
  }));

  api.post('/projects/:id/messages', requireUser, withUser((user, req) => {
    const input = parseBody(messageSchema, req.body);
    return postMessage(db, user, String(req.params.id), input.body);
  }));

  api.post('/projects/:id/deliveries', requireRole('creator'), withUser((user, req) => {
    const input = parseBody(deliverySchema, req.body);
    if (!input.fileUrl.startsWith('/uploads/')) throw new HttpError(400, 'Upload the file before attaching it to the project.', 'BAD_MEDIA');
    return addDelivery(db, user, String(req.params.id), input);
  }));

  api.post('/projects/:id/revisions', requireRole('customer'), withUser((user, req) => {
    const input = parseBody(revisionRequestSchema, req.body);
    return requestRevision(db, user, String(req.params.id), input.notes);
  }));

  api.post('/projects/:id/complete', requireRole('customer'), withUser((user, req) => {
    return confirmCompletion(db, user, String(req.params.id));
  }));

  api.post('/projects/:id/cancel', requireUser, route(async (req, res) => {
    const user = getUserRow(db, (req.user as AuthUser).id) as UserRow;
    const input = parseBody(reasonSchema, req.body);
    const result = await cancelProject(db, provider, user, String(req.params.id), input.reason);
    res.json({ project: result.project, refund: result.refund, alreadyCancelled: result.alreadyCancelled, message: result.message });
  }));

  api.post('/projects/:id/dispute', requireUser, withUser((user, req) => {
    const input = parseBody(disputeSchema, req.body);
    return openDispute(db, user, String(req.params.id), input.reason);
  }));

  api.post('/projects/:id/reviews', requireUser, withUser((user, req) => {
    const input = parseBody(reviewSchema, req.body);
    return createReview(db, user, String(req.params.id), input);
  }));

  /* ---------------- Payments ---------------- */

  api.post('/projects/:id/checkout', requireRole('customer'), route(async (req, res) => {
    const user = getUserRow(db, (req.user as AuthUser).id) as UserRow;
    const input = parseBody(checkoutSchema, req.body);
    // A deposit needs the current policy and terms accepted at checkout. The balance does not.
    const acceptance = input.kind === 'deposit' ? requireCurrentPolicy(input) : null;
    const result = await startCheckout(db, provider, user, String(req.params.id), input.kind, acceptance);
    res.json({
      payment: result.payment,
      clientSecret: result.clientSecret,
      mode: result.mode,
      amountCents: result.amountCents,
      kind: result.kind,
      project: result.project,
    });
  }));

  api.post('/payments/:id/demo-confirm', requireRole('customer'), route((req, res) => {
    if (provider.mode !== 'demo') throw conflict('Demo confirmation is disabled because live payments are enabled.', 'NOT_DEMO');
    const user = getUserRow(db, (req.user as AuthUser).id) as UserRow;
    const payment = demoConfirm(db, user, String(req.params.id));
    const projectId = get<{ project_id: string }>(db, 'SELECT project_id FROM payments WHERE id = ?', payment.id)?.project_id as string;
    res.json({ payment, project: buildDetail(db, requireProject(db, projectId), user.id) });
  }));

  api.post('/payments/:id/sync', requireRole('customer'), route(async (req, res) => {
    const user = getUserRow(db, (req.user as AuthUser).id) as UserRow;
    const payment = await syncPayment(db, provider, user, String(req.params.id));
    const projectId = get<{ project_id: string }>(db, 'SELECT project_id FROM payments WHERE id = ?', payment.id)?.project_id as string;
    res.json({ payment, project: buildDetail(db, requireProject(db, projectId), user.id) });
  }));

  /* ---------------- Refunds and cancellations ---------------- */

  // A delivery or quality request, or a request for agreed work not delivered. Cancellations use /cancel above.
  api.post('/projects/:id/refund-requests', requireRole('customer'), withUser((user, req) => {
    const input = parseBody(refundRequestSchema, req.body);
    return submitRefundRequest(db, user, String(req.params.id), input);
  }));

  api.post('/refund-requests/:id/withdraw', requireRole('customer'), withUser((user, req) => {
    return withdrawRefundRequest(db, user, String(req.params.id));
  }));

  api.post('/refund-requests/:id/notes', requireUser, withUser((user, req) => {
    const input = parseBody(refundNoteSchema, req.body);
    return addRefundNote(db, user, String(req.params.id), input.body);
  }));

  api.post('/refund-requests/:id/retry', requireRole('customer'), route(async (req, res) => {
    const user = getUserRow(db, (req.user as AuthUser).id) as UserRow;
    res.json({ project: await retryRefund(db, provider, user, String(req.params.id)) });
  }));

  // Photo Shoot reviewers only. Everyone else receives 403.
  api.get('/refund-requests/review', requireUser, route((req, res) => {
    const user = getUserRow(db, (req.user as AuthUser).id) as UserRow;
    res.json({ items: refundReviewQueue(db, user) });
  }));

  api.post('/refund-requests/:id/decision', requireUser, route(async (req, res) => {
    const user = getUserRow(db, (req.user as AuthUser).id) as UserRow;
    const input = parseBody(refundDecisionSchema, req.body);
    res.json({ project: await decideRefundRequest(db, provider, user, String(req.params.id), input) });
  }));

  /* ---------------- Uploads ---------------- */

  api.post('/uploads', requireUser, route((req, res) => {
    const input = parseBody(uploadSchema, req.body);
    const saved = saveUpload(uploadsDir, input);
    res.status(201).json(saved);
  }));

  api.get('/health', (_req, res) => {
    res.json({ ok: true, paymentMode: provider.mode, uploadsDir: path.basename(uploadsDir), now: nowIso() });
  });

  api.use('/messages', createMessagingRouter({ db, hub, guards, allowedOrigins, streamRevalidateMs: ctx.streamRevalidateMs }));
  api.use('/moderation', createModerationRouter({ db, allowedOrigins }));

  app.use('/api', api);
}

/** Stripe webhook. Must be mounted before express.json() so the raw body is preserved. */
export function stripeWebhook(ctx: AppContext): RequestHandler[] {
  const parseRaw = express.raw({ type: 'application/json', limit: '1mb' });
  const handle = (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      res.status(400).json({ error: 'Missing Stripe signature.' });
      return;
    }
    let event: { type: string; data: { object: { id?: string; status?: string } } };
    try {
      event = constructStripeEvent(ctx.env, req.body as Buffer, signature) as unknown as typeof event;
    } catch (error) {
      console.error('[webhook] signature check failed', (error as Error).message);
      res.status(400).json({ error: 'Signature check failed.' });
      return;
    }
    const ref = event.data?.object?.id;
    if (ref) {
      if (event.type === 'payment_intent.succeeded') applyProviderEvent(ctx.db, ref, 'succeeded');
      if (event.type === 'payment_intent.payment_failed') applyProviderEvent(ctx.db, ref, 'failed');
      if (event.type === 'payment_intent.canceled') applyProviderEvent(ctx.db, ref, 'canceled');
      // Refund events confirm or fail a refund that was sent earlier. Only the provider can confirm a refund.
      if (event.type.startsWith('refund.')) applyRefundEvent(ctx.db, ref, refundOutcomeFromStripe(event.data.object.status));
    }
    res.json({ received: true });
  };
  return [parseRaw, handle];
}
