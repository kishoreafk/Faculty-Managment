import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPool } = vi.hoisted(() => ({
  mockPool: { execute: vi.fn(), query: vi.fn() },
}));

vi.mock('../../config/database.js', () => ({ pool: mockPool }));

import { adminLogRepository } from '../AdminLogRepository.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('AdminLogRepository', () => {
  it('findWithFilters builds query dynamically', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);

    const result = await adminLogRepository.findWithFilters({
      adminId: 1, actionType: 'USER_CREATED', limit: 10, offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
  });

  it('findWithFilters with all filters', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await adminLogRepository.findWithFilters({
      adminId: 1, actionType: 'DELETE', resourceType: 'faculty',
      from: '2024-01-01', to: '2024-12-31', limit: 5, offset: 0,
    });

    const countCall = mockPool.query.mock.calls[0];
    expect(countCall[0]).toContain('admin_id = ?');
    expect(countCall[0]).toContain('action_type = ?');
    expect(countCall[0]).toContain('resource_type = ?');
    expect(countCall[0]).toContain('created_at >= ?');
    expect(countCall[0]).toContain('created_at <= ?');
  });

  it('findWithFilters handles no filters', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 100 }]])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    const result = await adminLogRepository.findWithFilters({ limit: 25, offset: 0 });
    expect(result.total).toBe(100);
  });
});
