import { describe, it, expect } from 'vitest';
import { createProductRequestSchema, reviewProductSchema, productIdParam } from '../product';

describe('createProductRequestSchema', () => {
  it('accepts valid product request', () => {
    const result = createProductRequestSchema.safeParse({
      item_name: 'Laptop', quantity: 2, reason: 'Lab upgrade',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty item name', () => {
    const result = createProductRequestSchema.safeParse({
      item_name: '', quantity: 1, reason: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive quantity', () => {
    const result = createProductRequestSchema.safeParse({
      item_name: 'Desk', quantity: 0, reason: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('coerces string quantity to number', () => {
    const result = createProductRequestSchema.safeParse({
      item_name: 'Chair', quantity: '5', reason: 'Office',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantity).toBe(5);
  });
});

describe('reviewProductSchema', () => {
  it('accepts APPROVED with reason', () => {
    const result = reviewProductSchema.safeParse({ action: 'APPROVED', reason: 'Good' });
    expect(result.success).toBe(true);
  });

  it('rejects empty reason', () => {
    const result = reviewProductSchema.safeParse({ action: 'REJECTED', reason: '' });
    expect(result.success).toBe(false);
  });
});

describe('productIdParam', () => {
  it('accepts valid product id', () => {
    const result = productIdParam.safeParse({ id: 10 });
    expect(result.success).toBe(true);
  });

  it('rejects string id', () => {
    const result = productIdParam.safeParse({ id: 'abc' });
    expect(result.success).toBe(false);
  });
});
