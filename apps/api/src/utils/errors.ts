import { ERROR_CODES, type ErrorCode } from '@mango/shared';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
export const unauthenticated = (message = 'Authentication required') => new AppError(401, ERROR_CODES.UNAUTHENTICATED, message);
export const forbidden = (message = 'You do not have permission to perform this action') => new AppError(403, ERROR_CODES.FORBIDDEN, message);
export const notFound = (what = 'Resource') => new AppError(404, ERROR_CODES.NOT_FOUND, `${what} not found`);
export const conflict = (message: string, code: ErrorCode = ERROR_CODES.CONFLICT) => new AppError(409, code, message);
