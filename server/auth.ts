import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { get, newId, nowIso, run, type Db } from './db';
import { HttpError } from './http';

export const SESSION_COOKIE = 'ps_session';
const SESSION_DAYS = 14;
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

export interface AuthUser {
  id: string;
  email: string;
  role: 'customer' | 'creator';
  name: string;
  bio: string;
  is_demo: number;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltText, keyText] = stored.split('$');
  if (scheme !== 'scrypt' || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, 'base64url');
  const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length, SCRYPT);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Identifies a session without holding its token. Realtime streams use this to end access on logout or expiry. */
export function sessionKeyFor(token: string): string {
  return hashToken(token);
}

export function createSession(db: Db, userId: string): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_DAYS * 86_400_000);
  run(
    db,
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    hashToken(token),
    userId,
    createdAt.toISOString(),
    expiresAt.toISOString(),
  );
  return { token, expiresAt };
}

export function destroySession(db: Db, token: string): void {
  run(db, 'DELETE FROM sessions WHERE token_hash = ?', hashToken(token));
}

export function userFromToken(db: Db, token: string): AuthUser | undefined {
  return get<AuthUser>(
    db,
    `SELECT u.id, u.email, u.role, u.name, u.bio, u.is_demo
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
    hashToken(token),
    nowIso(),
  );
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      // A malformed percent-encoding is a bad cookie, not a server fault. Treat it as signed out.
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    secure: process.env.COOKIE_SECURE === 'true',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/', sameSite: 'lax', httpOnly: true });
}

export function attachUser(db: Db) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = readCookie(req, SESSION_COOKIE);
    req.user = token ? userFromToken(db, token) : undefined;
    next();
  };
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    next(new HttpError(401, 'Sign in to continue.', 'AUTH_REQUIRED'));
    return;
  }
  next();
}

export function requireRole(role: 'customer' | 'creator') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new HttpError(401, 'Sign in to continue.', 'AUTH_REQUIRED'));
      return;
    }
    if (req.user.role !== role) {
      next(new HttpError(403, `This page is for ${role} accounts.`, 'WRONG_ACCOUNT_TYPE'));
      return;
    }
    next();
  };
}

export function createUserId(): string {
  return newId();
}
