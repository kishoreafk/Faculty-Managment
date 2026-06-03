import { describe, it, expect, vi } from 'vitest';
import { ZodError, z } from 'zod';

const env = vi.hoisted(() => ({ isProduction: false }));
vi.mock('../../config/env.js', () => env);

import { AppError, asyncHandler, errorHandler, notFoundHandler } from '../errorHandler.js';

function mockRes() {
  const res: any = { _json: null, _status: 0 };
  res.status = vi.fn((s: number) => { res._status = s; return res; });
  res.json = vi.fn((o: any) => { res._json = o; return res; });
  return res;
}

describe('AppError', () => {
  it('creates an error with status, code, message', () => {
    const err = new AppError(404, 'NOT_FOUND', 'User not found');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('User not found');
  });

  it('creates an error with optional details', () => {
    const err = new AppError(422, 'VALIDATION', 'Bad input', { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });
});

describe('asyncHandler', () => {
  it('calls the handler and resolves successfully', async () => {
    const handler = asyncHandler(async (_req: any, res: any) => {
      res.json({ ok: true });
    });
    const req = {} as any;
    const res = { json: vi.fn() } as any;
    const next = vi.fn();

    await handler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('catches a thrown error and forwards to next', async () => {
    const error = new Error('boom');
    const handler = asyncHandler(async () => { throw error; });
    const next = vi.fn();

    await handler({} as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it('catches a rejected promise and forwards to next', async () => {
    const error = new AppError(400, 'BAD', 'bad request');
    const handler = asyncHandler(async () => Promise.reject(error));
    const next = vi.fn();

    handler({} as any, {} as any, next);
    await vi.waitFor(() => { expect(next).toHaveBeenCalledWith(error); });
  });
});

describe('errorHandler', () => {
  it('handles AppError', () => {
    const res = mockRes();
    errorHandler(new AppError(404, 'NOT_FOUND', 'User not found'), {} as any, res, vi.fn());
    expect(res._status).toBe(404);
    expect(res._json).toEqual({ error: 'User not found', code: 'NOT_FOUND' });
  });

  it('handles AppError with details', () => {
    const res = mockRes();
    errorHandler(new AppError(422, 'VALIDATION', 'Bad', { field: 'x' }), {} as any, res, vi.fn());
    expect(res._json.details).toEqual({ field: 'x' });
  });

  it('handles ZodError', () => {
    const res = mockRes();
    const schema = z.object({ name: z.string().min(1) });
    let zodErr: ZodError;
    try { schema.parse({ name: '' }); } catch (e) { zodErr = e as ZodError; }
    errorHandler(zodErr!, {} as any, res, vi.fn());
    expect(res._status).toBe(400);
    expect(res._json.code).toBe('VALIDATION_ERROR');
  });

  it('handles MySQL errors', () => {
    const res = mockRes();
    const dbErr = new Error('Duplicate entry') as any;
    dbErr.code = 'ER_DUP_ENTRY';
    dbErr.errno = 1062;
    dbErr.sqlMessage = 'Duplicate entry "x" for key "email"';
    errorHandler(dbErr, {} as any, res, vi.fn());
    expect(res._status).toBe(409);
    expect(res._json.code).toBe('ER_DUP_ENTRY');
  });

  it('handles Multer file size errors', () => {
    const res = mockRes();
    const multerErr = new Error('File too large') as any;
    multerErr.code = 'LIMIT_FILE_SIZE';
    errorHandler(multerErr, {} as any, res, vi.fn());
    expect(res._status).toBe(413);
    expect(res._json.code).toBe('LIMIT_FILE_SIZE');
  });

  it('handles JWT errors', () => {
    const res = mockRes();
    errorHandler({ name: 'JsonWebTokenError', message: 'jwt malformed' } as any, {} as any, res, vi.fn());
    expect(res._status).toBe(401);
    expect(res._json.code).toBe('INVALID_TOKEN');
  });

  it('handles TokenExpiredError', () => {
    const res = mockRes();
    errorHandler({ name: 'TokenExpiredError', message: 'jwt expired' } as any, {} as any, res, vi.fn());
    expect(res._status).toBe(401);
    expect(res._json.code).toBe('TOKEN_EXPIRED');
  });

  it('handles fallback unknown errors', () => {
    const res = mockRes();
    errorHandler(new Error('Something broke'), {} as any, res, vi.fn());
    expect(res._status).toBe(500);
    expect(res._json.code).toBe('INTERNAL_ERROR');
  });

  it('hides error message in production', () => {
    env.isProduction = true;
    const res = mockRes();
    errorHandler(new Error('Secret details'), {} as any, res, vi.fn());
    expect(res._status).toBe(500);
    expect(res._json.error).toBe('Internal server error');
    env.isProduction = false;
  });
});

describe('notFoundHandler', () => {
  it('returns 404 with route info', () => {
    const res = mockRes();
    notFoundHandler({ method: 'GET', originalUrl: '/api/unknown' } as any, res);
    expect(res._status).toBe(404);
    expect(res._json.code).toBe('NOT_FOUND');
    expect(res._json.error).toContain('/api/unknown');
  });
});
