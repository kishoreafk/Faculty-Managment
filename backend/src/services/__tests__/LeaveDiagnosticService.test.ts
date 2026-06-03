import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPool } = vi.hoisted(() => ({
  mockPool: { execute: vi.fn() },
}));

vi.mock('../../config/database.js', () => ({ pool: mockPool }));
vi.mock('../../utils/spDiagnostics.js', () => ({
  parseSpDiagnostic: vi.fn(),
  spErrorDiagnostic: vi.fn(),
  spUnknownDiagnostic: vi.fn(),
}));

import { LeaveDiagnosticService } from '../LeaveDiagnosticService.js';

beforeEach(() => { vi.clearAllMocks(); });

const makeUser = (overrides = {}) => ({
  id: 1,
  faculty_type_id: 1,
  gender: 'MALE',
  doj: '2023-01-15',
  ...overrides,
});

const makeLeaveTypes = () => [
  { id: 1, name: 'Medical Leave', code: 'ML', gender_restriction: 'ALL', active: true },
  { id: 2, name: 'Maternity Leave', code: 'MAT', gender_restriction: 'FEMALE', active: true },
  { id: 3, name: 'Paternity Leave', code: 'PAT', gender_restriction: 'MALE', active: true },
];

const makeRule = (overrides = {}) => ({
  leave_type_id: 1,
  accrual_rate: 1,
  accrual_period: 'MONTHLY',
  max_balance: 30,
  min_service_months: 0,
  probation_excluded: false,
  ...overrides,
});

const makeBalance = (overrides = {}) => ({
  faculty_id: 1,
  leave_type_id: 1,
  name: 'Medical Leave',
  code: 'ML',
  gender_restriction: 'ALL',
  balance: 10,
  reserved: 2,
  year: 2026,
  ...overrides,
});

describe('LeaveDiagnosticService.computeForFaculty', () => {
  it('returns empty array when user not found', async () => {
    mockPool.execute.mockResolvedValue([[]]);
    const result = await LeaveDiagnosticService.computeForFaculty(999);
    expect(result).toEqual([]);
  });

  it('returns OK for leave type with matching rule', async () => {
    mockPool.execute
      .mockResolvedValueOnce([[makeUser()]])
      .mockResolvedValueOnce([makeLeaveTypes()])
      .mockResolvedValueOnce([[makeRule()]])
      .mockResolvedValueOnce([[makeBalance()]]);

    const result = await LeaveDiagnosticService.computeForFaculty(1);
    expect(result[0].status).toBe('OK');
    expect(result[0].balance).toBe(10);
    expect(result[0].reserved).toBe(2);
  });

  it('returns GENDER_RESTRICTED for gender-mismatched leave types', async () => {
    mockPool.execute
      .mockResolvedValueOnce([[makeUser({ gender: 'MALE' })]])
      .mockResolvedValueOnce([makeLeaveTypes()])
      .mockResolvedValueOnce([[makeRule({ leave_type_id: 2 })]])
      .mockResolvedValueOnce([[]]);

    const result = await LeaveDiagnosticService.computeForFaculty(1);
    const mat = result.find((r: any) => r.leave_type_code === 'MAT');
    expect(mat).toBeDefined();
    expect(mat!.status).toBe('GENDER_RESTRICTED');
  });

  it('returns NO_RULE when no rule exists', async () => {
    mockPool.execute
      .mockResolvedValueOnce([[makeUser()]])
      .mockResolvedValueOnce([makeLeaveTypes()])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const result = await LeaveDiagnosticService.computeForFaculty(1);
    const ml = result.find((r: any) => r.leave_type_code === 'ML');
    expect(ml).toBeDefined();
    expect(ml!.status).toBe('NO_RULE');
  });

  it('returns PROBATION_EXCLUDED when probation active and service < 6 months', async () => {
    mockPool.execute
      .mockResolvedValueOnce([[makeUser({ doj: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) })]])
      .mockResolvedValueOnce([makeLeaveTypes()])
      .mockResolvedValueOnce([[makeRule({ leave_type_id: 1, probation_excluded: true })]])
      .mockResolvedValueOnce([[makeBalance()]]);

    const result = await LeaveDiagnosticService.computeForFaculty(1);
    expect(result[0].status).toBe('PROBATION_EXCLUDED');
  });

  it('returns MIN_SERVICE_NOT_MET when min_service_months not reached', async () => {
    mockPool.execute
      .mockResolvedValueOnce([[makeUser({ doj: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) })]])
      .mockResolvedValueOnce([makeLeaveTypes()])
      .mockResolvedValueOnce([[makeRule({ leave_type_id: 1, min_service_months: 6 })]])
      .mockResolvedValueOnce([[makeBalance()]]);

    const result = await LeaveDiagnosticService.computeForFaculty(1);
    expect(result[0].status).toBe('MIN_SERVICE_NOT_MET');
  });

  it('handles user with null DOJ', async () => {
    mockPool.execute
      .mockResolvedValueOnce([[makeUser({ doj: null })]])
      .mockResolvedValueOnce([makeLeaveTypes()])
      .mockResolvedValueOnce([[makeRule()]])
      .mockResolvedValueOnce([[makeBalance()]]);

    const result = await LeaveDiagnosticService.computeForFaculty(1);
    expect(result[0].status).toBe('OK');
  });

  it('handles user with null gender', async () => {
    mockPool.execute
      .mockResolvedValueOnce([[makeUser({ gender: null })]])
      .mockResolvedValueOnce([makeLeaveTypes()])
      .mockResolvedValueOnce([[makeRule()]])
      .mockResolvedValueOnce([[makeBalance()]]);

    const result = await LeaveDiagnosticService.computeForFaculty(1);
    expect(result[0].status).toBe('OK');
  });
});
