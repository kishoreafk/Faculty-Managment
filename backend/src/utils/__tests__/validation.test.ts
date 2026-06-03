import { describe, it, expect } from 'vitest';
import { isValidEmail, isValidDate, isNonNegativeInteger } from '../validation';

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user@sub.domain.com')).toBe(true);
    expect(isValidEmail('user+tag@domain.co')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null as any)).toBe(false);
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user@.com')).toBe(false);
  });
});

describe('isValidDate', () => {
  it('accepts valid date strings', () => {
    expect(isValidDate('2024-01-15')).toBe(true);
    expect(isValidDate('2024-12-31')).toBe(true);
    expect(isValidDate('2024-02-29')).toBe(true);
  });

  it('rejects invalid dates', () => {
    expect(isValidDate('')).toBe(false);
    expect(isValidDate('not-a-date')).toBe(false);
    expect(isValidDate(null as any)).toBe(false);
  });
});

describe('isNonNegativeInteger', () => {
  it('accepts non-negative integers', () => {
    expect(isNonNegativeInteger('0')).toBe(true);
    expect(isNonNegativeInteger('1')).toBe(true);
    expect(isNonNegativeInteger('100')).toBe(true);
  });

  it('rejects negative or non-numeric strings', () => {
    expect(isNonNegativeInteger('')).toBe(false);
    expect(isNonNegativeInteger('-1')).toBe(false);
    expect(isNonNegativeInteger('abc')).toBe(false);
    expect(isNonNegativeInteger('1.5')).toBe(false);
    expect(isNonNegativeInteger(null as any)).toBe(false);
  });
});
