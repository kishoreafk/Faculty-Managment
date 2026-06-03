import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockCreate = vi.fn(() => ({
  get: mockGet,
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));

vi.mock('axios', () => ({ default: { create: mockCreate } }));

beforeEach(() => { vi.clearAllMocks(); });

describe('logsApi', () => {
  it('getAll calls GET /admin/logs with params', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
    const { logsApi } = await import('../logs');
    await logsApi.getAll({ page: 1, pageSize: 50, action: 'USER_CREATED' });
    expect(mockGet).toHaveBeenCalledWith('/admin/logs', {
      params: { page: 1, pageSize: 50, action: 'USER_CREATED' },
    });
  });

  it('getById calls GET /admin/logs/:id', async () => {
    mockGet.mockResolvedValue({ data: { id: 5 } });
    const { logsApi } = await import('../logs');
    const res = await logsApi.getById(5);
    expect(mockGet).toHaveBeenCalledWith('/admin/logs/5');
    expect(res.data.id).toBe(5);
  });

  it('export calls GET /admin/logs/export with blob response', async () => {
    mockGet.mockResolvedValue({ data: new Blob() });
    const { logsApi } = await import('../logs');
    await logsApi.export({ startDate: '2024-01-01' });
    expect(mockGet).toHaveBeenCalledWith('/admin/logs/export', {
      params: { startDate: '2024-01-01' },
      responseType: 'blob',
    });
  });
});
