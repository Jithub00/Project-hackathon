import { hashPassword, verifyPassword } from '../auth';
import { get, type Db } from '../db';
import { grantModerator, isModerator } from './messaging';
import { insertUser } from './people';

export type StaffBootstrapOutcome = 'disabled' | 'created' | 'granted' | 'already-staff' | 'skipped';

/**
 * Creates or confirms the platform reviewer account named by STAFF_BOOTSTRAP_EMAIL and STAFF_BOOTSTRAP_PASSWORD.
 *
 * Reviewer access is granted only when the operator-supplied password matches the account. Registering an address
 * is not enough, and reviewer addresses are reserved from self-service sign-up (MODERATOR_EMAILS). Runs at startup.
 */
export function bootstrapStaffAccount(db: Db, env: NodeJS.ProcessEnv): StaffBootstrapOutcome {
  const email = env.STAFF_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = env.STAFF_BOOTSTRAP_PASSWORD;
  if (!email || !password) return 'disabled';

  const existing = get<{ id: string; password_hash: string }>(db, 'SELECT id, password_hash FROM users WHERE email = ?', email);
  if (!existing) {
    const id = insertUser(db, {
      email,
      passwordHash: hashPassword(password),
      role: 'customer',
      name: 'Photo Shoot Reviewer',
      bio: '',
    });
    grantModerator(db, id);
    return 'created';
  }
  if (!verifyPassword(password, existing.password_hash)) return 'skipped';
  if (isModerator(db, existing.id)) return 'already-staff';
  grantModerator(db, existing.id);
  return 'granted';
}
