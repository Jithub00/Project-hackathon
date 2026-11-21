import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../http';

/** Extra origins allowed to use messaging, from ALLOWED_ORIGINS (comma-separated, for example https://photoshoot.example). */
export function allowedOriginsFromEnv(env: NodeJS.ProcessEnv): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => origin.length > 0);
}

/**
 * Browsers send an Origin header on cross-site requests. The request is accepted only when that origin matches
 * the host it was sent to, or appears in ALLOWED_ORIGINS. Requests without an Origin header are not cross-site.
 */
export function requireAllowedOrigin(allowed: readonly string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin === undefined) {
      next();
      return;
    }
    const host = req.headers.host ?? '';
    const sameHost = host !== '' && (origin === `http://${host}` || origin === `https://${host}`);
    if (sameHost || allowed.includes(origin)) {
      next();
      return;
    }
    next(new HttpError(403, 'This request came from a site that is not allowed to use messages.', 'ORIGIN_NOT_ALLOWED'));
  };
}
