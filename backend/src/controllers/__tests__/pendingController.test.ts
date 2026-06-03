import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPool, mockSendLeaveReviewEmail, mockSendProductReviewEmail } = vi.hoisted(() => ({
  mockPool: { execute: vi.fn(), getConnection: vi.fn() },
  mockSendLeaveReviewEmail: vi.fn(),
  mockSendProductReviewEmail: vi.fn(),
}));

vi.mock('../../config/database.js', () => ({ pool: mockPool }));
vi.mock('../../services/AuditService.js', () => ({ AuditService: { logFromRequest: vi.fn() } }));
vi.mock('../../utils/emailTemplates.js', () => ({
  sendLeaveReviewEmail: (...args: any[]) => Promise.resolve(mockSendLeaveReviewEmail(...args)),
  sendProductReviewEmail: (...args: any[]) => Promise.resolve(mockSendProductReviewEmail(...args)),
}));
vi.mock('../../utils/timeFormat.js', () => ({ formatRowDates: vi.fn(), formatRowDateTimes: vi.fn() }));

// Mock asyncHandler to be transparent so we get the promise back for await
vi.mock('../../middleware/errorHandler.js', async () => {
  const actual = await vi.importActual<any>('../../middleware/errorHandler.js');
  return {
    ...actual,
    asyncHandler: <T extends (...args: any[]) => any>(fn: T) => fn,
  };
});

beforeEach(() => { vi.clearAllMocks(); });

import { getPendingLeave, getPendingProducts, reviewLeave, reviewProduct } from '../pendingController.js';

function mockReq(overrides = {}) {
  return { user: { id: 1, role: 'ADMIN' }, params: {}, body: {}, ip: '127.0.0.1', get: vi.fn(), ...overrides } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('getPendingLeave', () => {
  it('returns pending leaves', async () => {
    const req = mockReq();
    const res = mockRes(); const next = vi.fn();
    mockPool.execute.mockResolvedValue([[{ id: 1, faculty_name: 'Test', status: 'PENDING' }]]);
    await getPendingLeave(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 1 })]));
  });
});

describe('getPendingProducts', () => {
  it('returns pending products', async () => {
    const req = mockReq();
    const res = mockRes(); const next = vi.fn();
    mockPool.execute.mockResolvedValue([[{ id: 2, item_name: 'Laptop', status: 'PENDING' }]]);
    await getPendingProducts(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 2 })]));
  });
});

describe('reviewLeave', () => {
  it('approves a leave and sends email', async () => {
    const mockConn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockPool.execute.mockResolvedValueOnce([[{ id: 1, faculty_name: 'Test', faculty_email: 'test@test.com', leave_type: 'Medical', start_date: '2024-03-01', end_date: '2024-03-03' }]]);
    const req = mockReq({ params: { id: '1' }, body: { action: 'APPROVED', reason: 'Okay' } });
    const res = mockRes(); const next = vi.fn();
    await reviewLeave(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Leave approved successfully' }));
    expect(mockSendLeaveReviewEmail).toHaveBeenCalled();
  });

  it('rejects a leave', async () => {
    const mockConn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockPool.execute.mockResolvedValueOnce([[{ id: 1, faculty_name: 'Test', faculty_email: 'test@test.com', leave_type: 'Medical', start_date: '2024-03-01', end_date: '2024-03-03' }]]);
    const req = mockReq({ params: { id: '1' }, body: { action: 'REJECTED', reason: 'No coverage' } });
    const res = mockRes(); const next = vi.fn();
    await reviewLeave(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Leave rejected successfully' }));
  });

  it('passes error to next and rolls back', async () => {
    const mockConn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.execute.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({ params: { id: '1' }, body: { action: 'APPROVED', reason: 'Ok' } });
    const res = mockRes(); const next = vi.fn();
    await expect(reviewLeave(req, res, next)).rejects.toThrow('DB error');
    expect(mockConn.rollback).toHaveBeenCalled();
  });
});

describe('reviewProduct', () => {
  it('approves a product request and sends email', async () => {
    const mockConn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockPool.execute.mockResolvedValueOnce([[{ id: 1, faculty_name: 'Test', faculty_email: 'test@test.com', item_name: 'Laptop', quantity: 2, reason: 'Lab' }]]);
    const req = mockReq({ params: { id: '1' }, body: { action: 'APPROVED', reason: 'Good' } });
    const res = mockRes(); const next = vi.fn();
    await reviewProduct(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Product request approved successfully' }));
    expect(mockSendProductReviewEmail).toHaveBeenCalled();
  });

  it('rejects a product request', async () => {
    const mockConn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockPool.execute.mockResolvedValueOnce([[]]);
    const req = mockReq({ params: { id: '1' }, body: { action: 'REJECTED', reason: 'Budget' } });
    const res = mockRes(); const next = vi.fn();
    await reviewProduct(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Product request rejected successfully' }));
    expect(mockSendProductReviewEmail).not.toHaveBeenCalled();
  });
});
