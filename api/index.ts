import type { IncomingMessage, ServerResponse } from 'node:http';
import { app } from '../server.ts';
import { restoreOriginalUrl } from '../src/vercel-url.ts';

// Единая serverless-функция для всех /api/* (см. vercel.json и src/vercel-url.ts)
export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url) req.url = restoreOriginalUrl(req.url);
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
