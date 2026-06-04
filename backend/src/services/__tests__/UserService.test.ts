import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConnection, mockPool, mockFindById } = vi.hoisted(() => {
  const connection = {
    execute: vi.fn(),
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  const pool = {
    getConnection: vi.fn(() => connection),
    execute: vi.fn(),
  };
  const findById = vi.fn();
  return { mockConnection: connection, mockPool: pool, mockFindById: findById };
});

vi.mock('../../config/database.js', () => ({ pool: mockPool }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(() => '$2b$10$hashed') } }));
vi.mock('../../utils/spDiagnostics.js', () => ({
  parseSpDiagnostic: vi.fn(() => ({ status: 'OK', message: 'Leaves assigned' })),
}));
vi.mock('../../utils/emailTemplates.js', () => ({
  sendAccountCreatedEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../repositories/FacultyRepository.js', () => ({
  facultyRepository: {
    findById: (...args: any[]) => mockFindById(...args),
    update: vi.fn(() => true),
    softDelete: vi.fn(),
    restore: vi.fn(),
  },
}));
vi.mock('../../services/AuditService.js', () => ({
  AuditService: { logFromRequest: vi.fn(() => Promise.resolve(1n)) },
}));

import { UserService } from '../UserService.js';

const mockFaculty = {
  id: 1, name: 'Test User', email: 'test@example.com', employee_id: 'EMP001',
  role_id: 2, faculty_type_id: 1, imported: false, active: true, approved: true,
  department: 'CS', designation: 'Prof', doj: '2024-01-01', gender: 'MALE',
  experience_years: 5, qualification: 'PhD',
};

beforeEach(() => { vi.clearAllMocks(); });

const mockReq = (overrides = {}) => ({
  user: { id: 10, role: 'ADMIN', email: 'admin@test.com' },
  ip: '127.0.0.1',
  get: vi.fn(() => 'agent'),
  ...overrides,
} as any);

describe('UserService.createUser', () => {
  it('creates a user and returns id + diagnostic', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 4 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);
    mockConnection.query.mockResolvedValueOnce([[{ status: 'OK' }]]);

    const result = await UserService.createUser(mockReq(), {
      employee_id: 'E001', name: 'New', email: 'new@test.com',
      password: 'pass123', role: 'FACULTY', faculty_type_id: 1,
    });

    expect(result.id).toBe(1);
    expect(result.diagnostic).toBeDefined();
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
  });

  it('throws on duplicate email', async () => {
    mockConnection.execute.mockResolvedValueOnce([[{ id: 1 }]]);
    await expect(UserService.createUser(mockReq(), { employee_id: 'E001', name: 'Dup', email: 'dup@test.com', role: 'FACULTY', faculty_type_id: 1 })).rejects.toThrow('Email already exists');
  });

  it('throws on duplicate employee_id', async () => {
    mockConnection.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 1 }]]);
    await expect(UserService.createUser(mockReq(), { employee_id: 'E001', name: 'Dup', email: 'dup@test.com', role: 'FACULTY', faculty_type_id: 1 })).rejects.toThrow('Employee ID already exists');
  });

  it('handles stored procedure failure gracefully', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 4 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);
    mockConnection.query.mockRejectedValueOnce(new Error('SP error'));
    const result = await UserService.createUser(mockReq(), { employee_id: 'E002', name: 'SPFail', email: 'sp@test.com', role: 'FACULTY', faculty_type_id: 1 });
    expect(result.id).toBe(1);
  });
});

describe('UserService.updateUser', () => {
  it('updates a normal user', async () => {
    mockFindById.mockResolvedValue(mockFaculty);
    const result = await UserService.updateUser(mockReq(), 1, { name: 'Updated' });
    expect(result).toBeDefined();
  });

  it('throws on imported user without force_update', async () => {
    mockFindById.mockResolvedValue({ ...mockFaculty, imported: true });
    await expect(UserService.updateUser(mockReq(), 1, { name: 'Updated' })).rejects.toThrow('Imported users must be edited with forceUpdate=true');
  });

  it('allows updating imported user with force_update', async () => {
    mockFindById.mockResolvedValueOnce({ ...mockFaculty, imported: true }).mockResolvedValueOnce({ ...mockFaculty, imported: false, name: 'Updated' });
    const result = await UserService.updateUser(mockReq(), 1, { name: 'Updated', force_update: true });
    expect(result.imported).toBe(false);
  });

  it('throws on non-existent user', async () => {
    mockFindById.mockResolvedValue(null);
    await expect(UserService.updateUser(mockReq(), 999, { name: 'Nope' })).rejects.toThrow('User not found');
  });
});

describe('UserService.deleteUser and restoreUser', () => {
  it('soft deletes a user', async () => {
    mockFindById.mockResolvedValue(mockFaculty);
    await UserService.deleteUser(1, mockReq());
  });

  it('throws deleting non-existent user', async () => {
    mockFindById.mockResolvedValue(null);
    await expect(UserService.deleteUser(999, mockReq())).rejects.toThrow('User not found');
  });

  it('restores a deleted user', async () => {
    mockPool.execute.mockResolvedValue([[mockFaculty]]);
    await UserService.restoreUser(1, mockReq());
  });

  it('throws restoring non-deleted user', async () => {
    mockPool.execute.mockResolvedValue([[]]);
    await expect(UserService.restoreUser(999, mockReq())).rejects.toThrow('Deleted user not found');
  });
});

describe('UserService.promoteUser', () => {
  it('promotes user and logs', async () => {
    mockFindById.mockResolvedValue(mockFaculty);
    mockPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ name: 'HOD' }]]).mockResolvedValueOnce([mockFaculty]);
    const result = await UserService.promoteUser(1, 3, mockReq());
    expect(result).toBeDefined();
  });
});

describe('UserService.approveUser', () => {
  it('approves user with SP call', async () => {
    mockFindById.mockResolvedValue(mockFaculty);
    mockConnection.execute.mockResolvedValueOnce([[{ id: 2, name: 'FACULTY' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.query.mockResolvedValueOnce([[{ status: 'OK' }]]);
    const result = await UserService.approveUser(1, mockReq());
    expect(result.diagnostic).toBeDefined();
  });
});

describe('UserService.bulkDelete', () => {
  it('deletes multiple users and logs', async () => {
    mockPool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    const count = await UserService.bulkDelete([1, 2, 3], mockReq());
    expect(count).toBe(3);
    expect(mockPool.execute).toHaveBeenCalledTimes(3);
  });
});

describe('UserService.forceLogout', () => {
  it('revokes tokens and logs', async () => {
    mockFindById.mockResolvedValue(mockFaculty);
    mockPool.execute.mockResolvedValueOnce([[{ jti: 'abc' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await UserService.forceLogout(1, mockReq());
  });
});
