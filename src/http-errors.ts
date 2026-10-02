import type { Response } from 'express';

/** Бросается из обработчиков, чтобы вернуть клиенту понятную ошибку 4xx. */
// (поле объявлено явно: `node server.ts` работает в strip-only режиме без parameter properties)
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const sendError = (res: Response, error: any, fallback: string) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};
