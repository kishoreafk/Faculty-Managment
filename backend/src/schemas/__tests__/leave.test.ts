import { describe, it, expect } from 'vitest';
import { applyLeaveSchema, reviewLeaveSchema, leaveStatusParam } from '../leave';

describe('applyLeaveSchema', () => {
  it('accepts valid leave application', () => {
    const result = applyLeaveSchema.safeParse({
      leave_type_id: 1,
      start_date: '2024-03-01',
      end_date: '2024-03-03',
      total_days: 3,
      reason: 'Medical leave',
    });
    expect(result.success).toBe(true);
  });

  it('applies default values for optional fields', () => {
    const result = applyLeaveSchema.safeParse({
      leave_type_id: 1,
      start_date: '2024-03-01',
      end_date: '2024-03-03',
      total_days: 3,
      reason: 'Personal',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.leave_category).toBe('FULL_DAY');
      expect(result.data.is_during_exam).toBe(false);
    }
  });

  it('rejects invalid leave_category', () => {
    const result = applyLeaveSchema.safeParse({
      leave_type_id: 1, start_date: '2024-03-01', end_date: '2024-03-03',
      total_days: 1, reason: 'Test', leave_category: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = applyLeaveSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-positive total_days', () => {
    const result = applyLeaveSchema.safeParse({
      leave_type_id: 1, start_date: '2024-03-01', end_date: '2024-03-03',
      total_days: 0, reason: 'Test',
    });
    expect(result.success).toBe(false);
  });
});

describe('reviewLeaveSchema', () => {
  it('accepts APPROVED status', () => {
    const result = reviewLeaveSchema.safeParse({ status: 'APPROVED', reason: 'Approved' });
    expect(result.success).toBe(true);
  });

  it('accepts REJECTED status', () => {
    const result = reviewLeaveSchema.safeParse({ status: 'REJECTED', reason: 'No coverage' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = reviewLeaveSchema.safeParse({ status: 'PENDING', reason: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects empty reason', () => {
    const result = reviewLeaveSchema.safeParse({ status: 'APPROVED', reason: '' });
    expect(result.success).toBe(false);
  });
});

describe('leaveStatusParam', () => {
  it('accepts valid leave id', () => {
    const result = leaveStatusParam.safeParse({ id: 5 });
    expect(result.success).toBe(true);
  });

  it('rejects zero id', () => {
    const result = leaveStatusParam.safeParse({ id: 0 });
    expect(result.success).toBe(false);
  });
});
