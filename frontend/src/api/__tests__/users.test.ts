import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
const mockCreate = vi.fn(() => ({
  get: mockGet, post: mockPost, put: mockPut, delete: mockDelete,
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));

vi.mock('axios', () => ({ default: { create: mockCreate } }));

beforeEach(() => { vi.clearAllMocks(); });

describe('usersApi', () => {
  it('getAll calls GET /admin/users with params', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
    const { usersApi } = await import('../users');
    await usersApi.getAll({ page: 1, pageSize: 25, status: 'active' });
    expect(mockGet).toHaveBeenCalledWith('/admin/users', {
      params: { page: 1, pageSize: 25, status: 'active' },
    });
  });

  it('getById calls GET /admin/users/:id', async () => {
    mockGet.mockResolvedValue({ data: { id: 42, name: 'Test' } });
    const { usersApi } = await import('../users');
    const res = await usersApi.getById(42);
    expect(mockGet).toHaveBeenCalledWith('/admin/users/42');
    expect(res.data.name).toBe('Test');
  });

  it('create calls POST /admin/users', async () => {
    mockPost.mockResolvedValue({ data: { id: 1 } });
    const { usersApi } = await import('../users');
    await usersApi.create({ name: 'New', email: 'new@example.com' });
    expect(mockPost).toHaveBeenCalledWith('/admin/users', { name: 'New', email: 'new@example.com' });
  });

  it('update calls PUT /admin/users/:id', async () => {
    mockPut.mockResolvedValue({});
    const { usersApi } = await import('../users');
    await usersApi.update(1, { name: 'Updated' });
    expect(mockPut).toHaveBeenCalledWith('/admin/users/1', { name: 'Updated' });
  });

  it('delete calls DELETE /admin/users/:id', async () => {
    mockDelete.mockResolvedValue({});
    const { usersApi } = await import('../users');
    await usersApi.delete(1, 'cleanup');
    expect(mockDelete).toHaveBeenCalledWith('/admin/users/1', { data: { reason: 'cleanup' } });
  });

  it('approve calls POST /admin/users/:id/approve', async () => {
    mockPost.mockResolvedValue({});
    const { usersApi } = await import('../users');
    await usersApi.approve(5);
    expect(mockPost).toHaveBeenCalledWith('/admin/users/5/approve');
  });

  it('bulkApprove calls POST /admin/users/bulk-approve', async () => {
    mockPost.mockResolvedValue({});
    const { usersApi } = await import('../users');
    await usersApi.bulkApprove([1, 2, 3]);
    expect(mockPost).toHaveBeenCalledWith('/admin/users/bulk-approve', { ids: [1, 2, 3] });
  });
});

describe('pendingApi', () => {
  it('getPendingLeaves calls GET /admin/pending/leave', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { pendingApi } = await import('../users');
    await pendingApi.getPendingLeaves();
    expect(mockGet).toHaveBeenCalledWith('/admin/pending/leave');
  });

  it('reviewLeave calls PUT /admin/leave/:id/review', async () => {
    mockPut.mockResolvedValue({});
    const { pendingApi } = await import('../users');
    await pendingApi.reviewLeave(10, 'APPROVED', 'Okay');
    expect(mockPut).toHaveBeenCalledWith('/admin/leave/10/review', { action: 'APPROVED', reason: 'Okay' });
  });
});
