import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { attachUser } from './auth';
import { HttpError, errorHandler } from './http';
import { registerApi, stripeWebhook, type AppContext } from './routes/api';
import { MESSAGE_REQUEST_LIMIT_BYTES } from '../shared/messaging';

export interface CreateAppOptions extends AppContext {
  distDir?: string;
}

/** Maps an oversized message body to a message-specific error instead of the generic upload limit. */
function messageBodyLimit(error: unknown, _req: Request, _res: Response, next: NextFunction): void {
  if ((error as { type?: string } | undefined)?.type === 'entity.too.large') {
    next(new HttpError(413, 'That message is too long to send. Keep messages under 5,000 characters.', 'MESSAGE_TOO_LARGE'));
    return;
  }
  next(error);
}

/** Builds the Express app. Used by the server entry point and by the test suite. */
export function createApp(options: CreateAppOptions): express.Express {
  const { distDir } = options;
  const app = express();
  app.disable('x-powered-by');

  // The Stripe webhook needs the untouched request body for signature checks.
  app.post('/api/webhooks/stripe', ...stripeWebhook(options));

  // Private responses must not be stored by browsers or shared caches. This runs before the body parsers, so even a
  // rejected request (too large, malformed JSON) carries the header.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });
  // Messages get a small body limit. Mounting it first means the 40 MB parser below skips these requests.
  app.use('/api/messages', express.json({ limit: MESSAGE_REQUEST_LIMIT_BYTES }), messageBodyLimit);

  app.use(express.json({ limit: '40mb' }));
  app.use(attachUser(options.db));
  registerApi(app, options);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'That API route does not exist.', code: 'NOT_FOUND', fieldErrors: {} });
  });

  app.use('/uploads', express.static(options.uploadsDir, { index: false, maxAge: '1h' }));

  if (distDir && fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { index: 'index.html', maxAge: '1h' }));
    app.use((req, res, next) => {
      const isPage = req.method === 'GET' && !req.path.startsWith('/api') && !path.extname(req.path);
      if (!isPage) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
