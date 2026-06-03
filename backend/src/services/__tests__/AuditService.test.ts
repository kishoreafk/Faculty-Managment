import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPool } = vi.hoisted(() => ({
  mockPool: { execute: vi.fn(), query: vi.fn() },
}));

vi.mock('../../config/database.js', () => ({ pool: mockPool }));

import { AuditService } from '../AuditService.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('AuditService', () => {
  it('log writes to audit_logs table', async () => {
    mockPool.execute.mockResolvedValueOnce([{ insertId: 100n }]);

    const id = await AuditService.log({
      actorId: 1,
      action: 'USER_CREATED',
      entityType: 'faculty',
      entityId: 42,
      entityLabel: 'test@example.com',
    });

    expect(id).toBe(100n);
    const call = mockPool.execute.mock.calls[0];
    expect(call[0]).toContain('INSERT INTO audit_logs');
    expect(call[1]).toContain(1);
    expect(call[1]).toContain('USER_CREATED');
  });

  it('log writes to legacy admin_logs when actorId is provided', async () => {
    mockPool.execute
      .mockResolvedValueOnce([{ insertId: 1n }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await AuditService.log({ actorId: 5, action: 'DELETE', entityType: 'faculty' });

    const adminLogCall = mockPool.execute.mock.calls[1];
    expect(adminLogCall[0]).toContain('INSERT INTO admin_logs');
    expect(adminLogCall[1]).toContain(5);
  });

  it('log skips legacy admin_logs when actorId is null', async () => {
    mockPool.execute.mockResolvedValueOnce([{ insertId: 1n }]);

    await AuditService.log({ actorId: null, action: 'CRON_RUN', entityType: 'system' });

    expect(mockPool.execute).toHaveBeenCalledTimes(1);
  });

  it('log does not fail when legacy write throws', async () => {
    mockPool.execute
      .mockResolvedValueOnce([{ insertId: 1n }])
      .mockRejectedValueOnce(new Error('Table not found'));

    await expect(AuditService.log({ actorId: 1, action: 'TEST', entityType: 'test' })).resolves.toBe(1n);
  });

  it('log serializes before/after state as JSON', async () => {
    mockPool.execute
      .mockResolvedValueOnce([{ insertId: 2n }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await AuditService.log({
      actorId: 1,
      action: 'UPDATE',
      entityType: 'faculty',
      beforeState: { name: 'Old' },
      afterState: { name: 'New' },
    });

    const call = mockPool.execute.mock.calls[0];
    expect(call[1][7]).toBe(JSON.stringify({ name: 'Old' }));
    expect(call[1][8]).toBe(JSON.stringify({ name: 'New' }));
  });

  it('logFromRequest extracts actor info from request', async () => {
    mockPool.execute.mockResolvedValueOnce([{ insertId: 3n }]);

    const req = {
      user: { id: 10 },
      ip: '127.0.0.1',
      get: vi.fn(() => 'test-agent'),
    } as any;

    await AuditService.logFromRequest(req, {
      action: 'LOGIN',
      entityType: 'faculty',
      entityId: 10,
    });

    const call = mockPool.execute.mock.calls[0];
    expect(call[1]).toContain(10);
  });

  it('list builds filters dynamically', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 3 }]])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }, { id: 3 }]]);

    const result = await AuditService.list({
      action: 'USER_CREATED',
      actorId: 1,
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.page).toBe(1);
  });

  it('list clamps pageSize to max 100', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const result = await AuditService.list({ pageSize: 500 });
    expect(result.pageSize).toBe(100);
  });
});
