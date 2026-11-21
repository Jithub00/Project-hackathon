import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(status: number, message: string, code = 'ERROR', fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function validationError(error: ZodError): HttpError {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return new HttpError(400, 'Please fix the highlighted fields.', 'VALIDATION', fieldErrors);
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function notFound(message = 'We could not find that page.'): HttpError {
  return new HttpError(404, message, 'NOT_FOUND');
}

export function forbidden(message: string): HttpError {
  return new HttpError(403, message, 'FORBIDDEN');
}

export function conflict(message: string, code = 'CONFLICT'): HttpError {
  return new HttpError(409, message, code);
}

/** Wraps an async route handler so thrown errors reach the error middleware. */
export function route(handler: (req: Request, res: Response) => Promise<void> | void) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      fieldErrors: error.fieldErrors ?? {},
    });
    return;
  }
  if (error instanceof ZodError) {
    const mapped = validationError(error);
    res.status(400).json({ error: mapped.message, code: mapped.code, fieldErrors: mapped.fieldErrors ?? {} });
    return;
  }
  const typed = error as { type?: string; status?: number };
  if (typed?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request could not be read. Refresh the page and try again.', code: 'BAD_JSON', fieldErrors: {} });
    return;
  }
  if (typed?.type === 'entity.too.large') {
    res.status(413).json({ error: 'That file is too large for the demo upload limit.', code: 'TOO_LARGE', fieldErrors: {} });
    return;
  }
  console.error('[api] unexpected error', error);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.', code: 'SERVER_ERROR', fieldErrors: {} });
}
