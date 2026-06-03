import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validate } from '../validate.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    age: z.coerce.number().int().positive(),
  });

  it('passes valid body through and calls next', () => {
    const req = { body: { name: 'Alice', age: 30 } } as any;
    const res = mockRes();
    const next = vi.fn();

    validate(schema, 'body')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0]).toHaveLength(0);
  });

  it('replaces body with parsed/coerced data', () => {
    const req = { body: { name: 'Alice', age: '30' } } as any;
    const res = mockRes();
    const next = vi.fn();

    validate(schema, 'body')(req, res, next);
    expect(req.body.age).toBe(30);
  });

  it('returns 400 for invalid body', () => {
    const req = { body: { name: '', age: 0 } } as any;
    const res = mockRes();
    const next = vi.fn();

    validate(schema, 'body')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('validates query params', () => {
    const querySchema = z.object({ page: z.coerce.number().int().positive() });
    const req = { query: { page: '2' } } as any;
    const res = mockRes();
    const next = vi.fn();

    validate(querySchema, 'query')(req, res, next);
    expect(req.query.page).toBe(2);
    expect(next).toHaveBeenCalled();
  });

  it('validates route params', () => {
    const paramSchema = z.object({ id: z.coerce.number().int().positive() });
    const req = { params: { id: '42' } } as any;
    const res = mockRes();
    const next = vi.fn();

    validate(paramSchema, 'params')(req, res, next);
    expect(req.params.id).toBe(42);
    expect(next).toHaveBeenCalled();
  });

  it('forwards non-Zod errors to next', () => {
    const throwingSchema = {
      parse: () => { throw new Error('Unexpected'); },
    } as any;
    const req = { body: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    validate(throwingSchema, 'body')(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
