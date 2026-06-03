import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockCreate = vi.fn(() => ({
  get: mockGet,
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));

vi.mock('axios', () => ({ default: { create: mockCreate } }));

beforeEach(() => { vi.clearAllMocks(); });

describe('dashboardApi', () => {
  it('getStats calls GET /admin/dashboard/stats', async () => {
    mockGet.mockResolvedValue({ data: { total: 100 } });
    const { dashboardApi } = await import('../dashboard');
    const res = await dashboardApi.getStats();
    expect(mockGet).toHaveBeenCalledWith('/admin/dashboard/stats');
    expect(res.data.total).toBe(100);
  });

  it('getRecentActivity calls GET /admin/dashboard/recent-activity', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { dashboardApi } = await import('../dashboard');
    await dashboardApi.getRecentActivity();
    expect(mockGet).toHaveBeenCalledWith('/admin/dashboard/recent-activity');
  });

  it('getNotifications calls GET /admin/dashboard/notifications', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { dashboardApi } = await import('../dashboard');
    await dashboardApi.getNotifications();
    expect(mockGet).toHaveBeenCalledWith('/admin/dashboard/notifications');
  });
});
