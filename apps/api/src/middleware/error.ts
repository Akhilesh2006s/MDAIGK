import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ERROR_CODES } from '@mango/shared';
import { AppError } from '../utils/errors';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: ERROR_CODES.NOT_FOUND, message: `Route ${req.method} ${req.path} not found` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Validation failed',
        details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
      },
    });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Invalid value for ${err.path}` } });
  }
  if (typeof err === 'object' && err && (err as { code?: number }).code === 11000) {
    const keys = Object.keys((err as { keyPattern?: object }).keyPattern ?? {});
    return res.status(409).json({ error: { code: ERROR_CODES.CONFLICT, message: `Duplicate value for ${keys.join(', ') || 'unique field'}` } });
  }
  if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Malformed JSON body' } });
  }
  if (process.env.NODE_ENV !== 'test') console.error(err);
  return res.status(500).json({ error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Something went wrong' } });
}
