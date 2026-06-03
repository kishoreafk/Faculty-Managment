import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockPool, mockFacultyRepo, mockLeaveBalanceRepo,
  mockUserService, mockLeaveDiagService,
} = vi.hoisted(() => ({
  mockPool: { execute: vi.fn(), getConnection: vi.fn(), query: vi.fn() },
  mockFacultyRepo: { findAllWithJoin: vi.fn(), getWithRole: vi.fn(), findById: vi.fn() },
  mockLeaveBalanceRepo: { findByFacultyAndYear: vi.fn() },
  mockUserService: { createUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(), restoreUser: vi.fn(), promoteUser: vi.fn(), forceLogout: vi.fn(), bulkDelete: vi.fn(), approveUser: vi.fn() },
  mockLeaveDiagService: { computeForFaculty: vi.fn() },
}));

vi.mock('../../config/database.js', () => ({ pool: mockPool }));
vi.mock('../../repositories/FacultyRepository.js', () => ({ facultyRepository: mockFacultyRepo }));
vi.mock('../../repositories/LeaveBalanceRepository.js', () => ({ leaveBalanceRepository: mockLeaveBalanceRepo }));
vi.mock('../../services/UserService.js', () => ({ UserService: mockUserService }));
vi.mock('../../services/LeaveDiagnosticService.js', () => ({ LeaveDiagnosticService: mockLeaveDiagService }));
vi.mock('../../services/AuditService.js', () => ({ AuditService: { logFromRequest: vi.fn() } }));
vi.mock('../../utils/timeFormat.js', () => ({ formatRowDates: vi.fn(), formatRowDateTimes: vi.fn() }));
vi.mock('../../utils/spDiagnostics.js', () => ({ parseSpDiagnostic: vi.fn(() => ({ status: 'OK' })), spUnknownDiagnostic: vi.fn(() => ({ status: 'UNKNOWN' })) }));

// Mock asyncHandler to be transparent so we get the promise back for await
vi.mock('../../middleware/errorHandler.js', async () => {
  const actual = await vi.importActual<any>('../../middleware/errorHandler.js');
  return {
    ...actual,
    asyncHandler: <T extends (...args: any[]) => any>(fn: T) => fn,
  };
});

beforeEach(() => { vi.clearAllMocks(); });

import { getAllUsers, getUserById, createUser, updateUser, deleteUser, promoteUser, approveUser, rejectUser, bulkDelete, bulkApprove, forceLogout, restoreUser, reassignLeaves, permanentDelete, bulkPermanentDelete } from '../userController.js';

function mockReq(overrides = {}) {
  return { user: { id: 1, role: 'ADMIN' }, body: {}, params: {}, query: {}, ip: '127.0.0.1', get: vi.fn(), ...overrides } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('getAllUsers', () => {
  it('returns paginated user list', async () => {
    const req = mockReq({ query: { page: '1', pageSize: '25', status: 'active' } });
    const res = mockRes(); const next = vi.fn();
    mockFacultyRepo.findAllWithJoin.mockResolvedValue({ rows: [{ id: 1, name: 'A' }], total: 1 });
    mockPool.execute.mockResolvedValue([[{ count: 0 }]]);
    await getAllUsers(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1, page: 1, pageSize: 25 }));
  });

  it('handles search query', async () => {
    const req = mockReq({ query: { query: 'john', status: 'active' } });
    const res = mockRes(); const next = vi.fn();
    mockFacultyRepo.findAllWithJoin.mockResolvedValue({ rows: [], total: 0 });
    mockPool.execute.mockResolvedValue([[{ count: 0 }]]);
    await getAllUsers(req, res, next);
    expect(mockFacultyRepo.findAllWithJoin.mock.calls[0][0].where).toContain('f.name LIKE ?');
  });
});

describe('getUserById', () => {
  it('returns user with balances and diagnostics', async () => {
    const req = mockReq({ params: { id: '1' } });
    const res = mockRes(); const next = vi.fn();
    mockFacultyRepo.getWithRole.mockResolvedValue({ id: 1, name: 'Test', role_name: 'FACULTY' });
    mockLeaveBalanceRepo.findByFacultyAndYear.mockResolvedValue([]);
    mockPool.execute.mockResolvedValue([[{ id: 1 }]]);
    mockLeaveDiagService.computeForFaculty.mockResolvedValue([]);
    await getUserById(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('throws 404 when user not found', async () => {
    const req = mockReq({ params: { id: '999' } });
    const res = mockRes(); const next = vi.fn();
    mockFacultyRepo.getWithRole.mockResolvedValue(null);
    await expect(getUserById(req, res, next)).rejects.toThrow('User not found');
  });
});

describe('createUser', () => {
  it('returns 201 with user id', async () => {
    const req = mockReq({ body: { name: 'New', email: 'new@test.com', employee_id: 'E1' } });
    const res = mockRes(); const next = vi.fn();
    mockUserService.createUser.mockResolvedValue({ id: 1, diagnostic: { status: 'OK' } });
    await createUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('blocks non-superadmin from creating superadmin', async () => {
    const req = mockReq({ body: { role: 'SUPER_ADMIN' }, user: { id: 1, role: 'ADMIN' } });
    const res = mockRes(); const next = vi.fn();
    await expect(createUser(req, res, next)).rejects.toThrow();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('updateUser', () => {
  it('updates user fields', async () => {
    const req = mockReq({ params: { id: '1' }, body: { name: 'Updated' } });
    const res = mockRes(); const next = vi.fn();
    mockUserService.updateUser.mockResolvedValue({ id: 1, name: 'Updated' });
    await updateUser(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User updated successfully' }));
  });

  it('handles role change', async () => {
    const req = mockReq({ params: { id: '1' }, body: { role: 'HOD' } });
    const res = mockRes(); const next = vi.fn();
    mockPool.execute.mockResolvedValueOnce([[{ id: 2, name: 'HOD' }]]);
    mockFacultyRepo.findById.mockResolvedValue({ id: 1, role_id: 2 });
    mockPool.execute.mockResolvedValueOnce([[{ name: 'FACULTY' }]]);
    mockUserService.updateUser.mockResolvedValue({ id: 1 });
    await updateUser(req, res, next);
    expect(res.json).toHaveBeenCalled();
  });
});

describe('deleteUser', () => {
  it('deletes and revokes tokens', async () => {
    const req = mockReq({ params: { id: '1' } });
    const res = mockRes(); const next = vi.fn();
    mockUserService.deleteUser.mockResolvedValue(undefined);
    mockPool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    await deleteUser(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User deleted successfully' }));
  });
});

describe('approveUser', () => {
  it('approves user', async () => {
    const req = mockReq({ params: { id: '1' } });
    const res = mockRes(); const next = vi.fn();
    mockUserService.approveUser.mockResolvedValue({ diagnostic: { status: 'OK' } });
    await approveUser(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User approved successfully' }));
  });
});

describe('rejectUser', () => {
  it('rejects unapproved user', async () => {
    const req = mockReq({ params: { id: '1' }, body: { reason: 'Invalid' } });
    const res = mockRes(); const next = vi.fn();
    const mockConn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), release: vi.fn() };
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.execute.mockResolvedValueOnce([[{ approved: false, email: 'a@b.com', name: 'Test' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await rejectUser(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User registration rejected and removed' }));
  });

  it('passes error to next when already approved', async () => {
    const req = mockReq({ params: { id: '1' } });
    const res = mockRes(); const next = vi.fn();
    const mockConn = { execute: vi.fn(), beginTransaction: vi.fn(), release: vi.fn(), commit: vi.fn() };
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.execute.mockResolvedValueOnce([[{ approved: true, email: 'a@b.com', name: 'Test' }]]);
    await expect(rejectUser(req, res, next)).rejects.toThrow();
  });
});

describe('bulkDelete', () => {
  it('deletes multiple users', async () => {
    const req = mockReq({ body: { ids: [1, 2] } });
    const res = mockRes(); const next = vi.fn();
    mockUserService.bulkDelete.mockResolvedValue(2);
    mockPool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    await bulkDelete(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ succeeded: 2 }));
  });

  it('passes error to next on invalid input', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes(); const next = vi.fn();
    await expect(bulkDelete(req, res, next)).rejects.toThrow();
  });
});

describe('bulkApprove', () => {
  it('approves multiple users', async () => {
    const req = mockReq({ body: { ids: [1, 2] } });
    const res = mockRes(); const next = vi.fn();
    mockUserService.approveUser.mockResolvedValue({});
    await bulkApprove(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ succeeded: 2 }));
  });
});

describe('promoteUser', () => {
  it('promotes user to new role', async () => {
    const req = mockReq({ params: { id: '1' }, body: { role: 'HOD' } });
    const res = mockRes(); const next = vi.fn();
    mockPool.execute.mockResolvedValue([[{ id: 3 }]]);
    mockUserService.promoteUser.mockResolvedValue({ id: 1, role_id: 3 });
    await promoteUser(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User role updated successfully' }));
  });

  it('passes error to next on invalid role', async () => {
    const req = mockReq({ params: { id: '1' }, body: { role: 'NONEXISTENT' } });
    const res = mockRes(); const next = vi.fn();
    mockPool.execute.mockResolvedValue([[]]);
    await expect(promoteUser(req, res, next)).rejects.toThrow();
  });
});

describe('forceLogout', () => {
  it('revokes sessions', async () => {
    const req = mockReq({ params: { id: '1' } });
    const res = mockRes(); const next = vi.fn();
    mockUserService.forceLogout.mockResolvedValue(undefined);
    await forceLogout(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User sessions revoked successfully' }));
  });
});

describe('restoreUser', () => {
  it('restores deleted user', async () => {
    const req = mockReq({ params: { id: '1' } });
    const res = mockRes(); const next = vi.fn();
    mockUserService.restoreUser.mockResolvedValue(undefined);
    await restoreUser(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User restored successfully' }));
  });
});

describe('reassignLeaves', () => {
  it('reassigns and returns diagnostic', async () => {
    const req = mockReq({ params: { id: '1' } });
    const res = mockRes(); const next = vi.fn();
    mockPool.execute.mockResolvedValue([[{ id: 1, faculty_type_id: 1, doj: '2024-01-01', gender: 'MALE' }]]);
    mockPool.query.mockResolvedValue([[{ status: 'OK', message: 'Done' }]]);
    await reassignLeaves(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Leave balances reassigned') }));
  });
});

describe('permanentDelete', () => {
  it('permanently deletes user', async () => {
    const req = mockReq({ params: { id: '1' }, body: { reason: 'Cleanup' } });
    const res = mockRes(); const next = vi.fn();
    const mockConn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), release: vi.fn() };
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.execute.mockResolvedValueOnce([[{ name: 'Test', email: 't@t.com' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await permanentDelete(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User permanently deleted' }));
  });
});

describe('bulkPermanentDelete', () => {
  it('bulk soft-deletes users', async () => {
    const req = mockReq({ body: { ids: [1, 2] } });
    const res = mockRes(); const next = vi.fn();
    mockPool.execute
      .mockResolvedValueOnce([[{ name: 'A', email: 'a@a.com' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ name: 'B', email: 'b@b.com' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await bulkPermanentDelete(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ succeeded: 2 }));
  });
});
