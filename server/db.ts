import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','creator')),
  name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creator_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  services TEXT NOT NULL CHECK (services IN ('photography','videography','both')),
  specialties TEXT NOT NULL DEFAULT '[]',
  styles TEXT NOT NULL DEFAULT '[]',
  neighborhoods TEXT NOT NULL DEFAULT '[]',
  citywide INTEGER NOT NULL DEFAULT 0,
  seeking_clients INTEGER NOT NULL DEFAULT 1,
  years_experience INTEGER NOT NULL DEFAULT 0,
  weekdays TEXT NOT NULL DEFAULT '[]',
  typical_hours TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creator_packages (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL CHECK (service IN ('photography','videography')),
  name TEXT NOT NULL,
  hours REAL NOT NULL,
  price_cents INTEGER NOT NULL,
  deliverables TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer_type TEXT NOT NULL DEFAULT 'individual' CHECK (customer_type IN ('individual','business')),
  business_name TEXT NOT NULL DEFAULT '',
  interests TEXT NOT NULL DEFAULT '[]',
  neighborhood TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_items (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo','video')),
  title TEXT NOT NULL,
  contribution TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL,
  poster_url TEXT,
  project_label TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS availability_dates (
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY (creator_id, date)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  services TEXT NOT NULL CHECK (services IN ('photography','videography','both')),
  budget_cents INTEGER NOT NULL,
  neighborhood TEXT NOT NULL,
  location_detail TEXT NOT NULL DEFAULT '',
  style_tags TEXT NOT NULL DEFAULT '[]',
  preferred_dates TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'invite' CHECK (visibility IN ('invite','open')),
  status TEXT NOT NULL DEFAULT 'draft',
  shoot_date TEXT,
  delivery_deadline TEXT,
  dispute_reason TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('interested','invited','accepted','declined')),
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS brief_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','pending','accepted','superseded','withdrawn')),
  content TEXT NOT NULL,
  required_approvers TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  UNIQUE (project_id, version_no)
);

CREATE TABLE IF NOT EXISTS brief_approvals (
  version_id TEXT NOT NULL REFERENCES brief_versions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  approved_at TEXT NOT NULL,
  PRIMARY KEY (version_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  round INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo','video','other')),
  size_bytes INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revision_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  notes TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','completed')),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('deposit','balance','refund')),
  amount_cents INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('demo','stripe')),
  provider_ref TEXT,
  client_secret TEXT,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled','held','paid')),
  scheduled_for TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  reviewee_id TEXT NOT NULL REFERENCES users(id),
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('customer','creator')),
  communication INTEGER NOT NULL,
  reliability INTEGER NOT NULL,
  professionalism INTEGER NOT NULL,
  quality INTEGER NOT NULL,
  expectations_met INTEGER NOT NULL,
  body TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, reviewer_id, reviewee_id)
);

CREATE TABLE IF NOT EXISTS project_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_packages_creator ON creator_packages(creator_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_creator ON portfolio_items(creator_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id);

-- Private direct messages. Project chat keeps the existing "messages" table.
-- Each pair of users has at most one conversation: user_low_id < user_high_id and UNIQUE(low, high).
CREATE TABLE IF NOT EXISTS dm_conversations (
  id TEXT PRIMARY KEY,
  user_low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  latest_seq INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  UNIQUE (user_low_id, user_high_id),
  CHECK (user_low_id < user_high_id)
);

-- seq is a global, strictly increasing order for messages. client_id is the sender's idempotency key.
CREATE TABLE IF NOT EXISTS dm_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_messages_dedupe ON dm_messages (sender_id, client_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation ON dm_messages (conversation_id, seq);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_low ON dm_conversations (user_low_id, latest_seq);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_high ON dm_conversations (user_high_id, latest_seq);

-- Per-user read position. Unread messages are those from the other person with seq above this value.
CREATE TABLE IF NOT EXISTS dm_reads (
  conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks (blocked_id);

-- Moderation records keep their own copy of the reported messages. No foreign keys, so the record outlives edits.
CREATE TABLE IF NOT EXISTS message_reports (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reported_user_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('harassment','spam','scam','unsafe','other')),
  details TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','closed')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moderators (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL
);

-- Refund and cancellation requests. A cancellation is recorded once per project. A delivery or quality request
-- can be open once per reason. Declined and withdrawn requests do not block a new one.
CREATE TABLE IF NOT EXISTS refund_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (reason IN ('cancellation','not_delivered','quality')),
  status TEXT NOT NULL CHECK (status IN ('submitted','under_review','approved','declined','withdrawn','refund_initiated','refunded','refund_failed','not_required')),
  requested_cents INTEGER,
  approved_cents INTEGER,
  cancelled_at TEXT,
  scheduled_start TEXT,
  qualifies_72h INTEGER,
  policy_version TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '{}',
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  decision_kind TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_one_cancellation ON refund_requests (project_id) WHERE reason = 'cancellation';
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_one_open_request ON refund_requests (project_id, reason) WHERE status NOT IN ('declined','withdrawn');

CREATE TABLE IF NOT EXISTS refund_request_notes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('customer','creator','platform')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refund_notes_request ON refund_request_notes (request_id, created_at);

-- One transfer per original payment that a refund draws on. The unique pair stops a retry from refunding it twice.
CREATE TABLE IF NOT EXISTS refund_transfers (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  refund_payment_id TEXT REFERENCES payments(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('pending','processing','succeeded','failed')),
  provider_ref TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (request_id, payment_id)
);
CREATE INDEX IF NOT EXISTS idx_refund_transfers_ref ON refund_transfers (provider_ref);

-- Each acceptance of the Refund and Cancellation Policy or the Terms, with the exact version and where it happened.
CREATE TABLE IF NOT EXISTS policy_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  document TEXT NOT NULL CHECK (document IN ('refund_policy','terms')),
  version TEXT NOT NULL,
  context TEXT NOT NULL,
  accepted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_policy_acceptances_project ON policy_acceptances (project_id, context, accepted_at);

-- The booking-time record: policy versions, and what the customer was buying when the deposit was confirmed.
CREATE TABLE IF NOT EXISTS booking_records (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  accepted_by TEXT REFERENCES users(id),
  accepted_at TEXT,
  booked_at TEXT NOT NULL,
  scheduled_start TEXT,
  snapshot TEXT NOT NULL
);
`;

export function openDatabase(file: string): Db {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return toIsoDate(date);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

export function all<T = Record<string, unknown>>(db: Db, sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

export function get<T = Record<string, unknown>>(db: Db, sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(db: Db, sql: string, ...params: unknown[]): void {
  db.prepare(sql).run(...(params as never[]));
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function bool(value: boolean): number {
  return value ? 1 : 0;
}

export function parseJsonArray<T = string>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
