import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';

/**
 * Custom error class for known, expected errors (e.g. 400/404/409/422).
 * Throw these in controllers; the central error handler will turn them
 * into safe JSON responses.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Wrap an async route handler so that any thrown / rejected error is
 * forwarded to the central error handler. Without this, Express 4 will
 * not catch async errors and the process will crash.
 */
export const asyncHandler =
  <T extends (req: Request, res: Response, next: NextFunction) => any>(fn: T) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * Central error-handling middleware. Mount LAST, after all routes.
 *
 * SECURITY: never echo `error.message` from upstream libraries (mysql,
 * bcrypt, etc.) to the client in production. Those messages can leak
 * schema details, file paths, and other sensitive information.
 */
export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  // 1) Known app errors
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {})
    });
    return;
  }

  // 2) Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message
      }))
    });
    return;
  }

  // 3) MySQL / mysql2 errors
  // Heuristic: if the error came from mysql2 it usually has `code` like
  // 'ER_DUP_ENTRY', 'ER_NO_REFERENCED_ROW_2', or `errno`.
  if (err && (err.code || err.errno) && typeof err.code === 'string' && err.code.startsWith('ER_')) {
    let debugMsg: string;
    switch (err.code) {
      case 'ER_DUP_ENTRY':
        debugMsg = `[DEBUG ERROR] Duplicate entry — ${err.sqlMessage || 'unique constraint violated'}`;
        break;
      case 'ER_NO_REFERENCED_ROW_2':
      case 'ER_ROW_IS_REFERENCED_2':
        debugMsg = `[DEBUG ERROR] Foreign key constraint failed — ${err.sqlMessage || 'referenced record missing or in use'}`;
        break;
      case 'ER_BAD_FIELD_ERROR':
        debugMsg = `[DEBUG ERROR] Unknown column in query — ${err.sqlMessage || 'check table schema matches code'}`;
        break;
      case 'ER_PARSE_ERROR':
        debugMsg = `[DEBUG ERROR] SQL syntax error — ${err.sqlMessage || 'check query syntax'}`;
        break;
      case 'ER_NO_SUCH_TABLE':
        debugMsg = `[DEBUG ERROR] Table does not exist — ${err.sqlMessage || 'run migrations first'}`;
        break;
      default:
        debugMsg = `[DEBUG ERROR] Database error (${err.code}) — ${err.sqlMessage || 'see full error below'}`;
    }
    console.error(debugMsg);
    console.error('[DEBUG ERROR] Full error:', { code: err.code, errno: err.errno, sqlMessage: err.sqlMessage });
    res.status(409).json({
      error: 'Database operation failed',
      code: err.code
    });
    return;
  }

  // 4) Multer / file upload errors
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')) {
    res.status(413).json({ error: err.message || 'File too large or too many files', code: err.code });
    return;
  }

  // 5) JWT errors (should normally be caught by the auth middleware, but
  //    belt-and-braces in case one bubbles up).
  if (err && err.name === 'JsonWebTokenError') {
    res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    return;
  }
  if (err && err.name === 'TokenExpiredError') {
    res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return;
  }

  // 6) Fallback: log full error server-side, return a generic message.
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({
    error: isProduction ? 'Internal server error' : (err?.message || 'Internal server error'),
    code: 'INTERNAL_ERROR'
  });
};

/**
 * 404 handler. Mount after all routes but before the error handler.
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND'
  });
};
