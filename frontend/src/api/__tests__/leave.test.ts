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

describe('leaveApi', () => {
  it('getBalance calls GET /leave/balance', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { leaveApi } = await import('../leave');
    await leaveApi.getBalance();
    expect(mockGet).toHaveBeenCalledWith('/leave/balance');
  });

  it('apply calls POST /leave/apply', async () => {
    mockPost.mockResolvedValue({});
    const { leaveApi } = await import('../leave');
    const payload = { leave_type_id: 1, start_date: '2024-03-01', end_date: '2024-03-03', total_days: 3, reason: 'Medical' };
    await leaveApi.apply(payload);
    expect(mockPost).toHaveBeenCalledWith('/leave/apply', payload);
  });

  it('getApplications calls GET /leave/applications', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { leaveApi } = await import('../leave');
    await leaveApi.getApplications();
    expect(mockGet).toHaveBeenCalledWith('/leave/applications');
  });

  it('getEligibility calls GET /leave/eligibility', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { leaveApi } = await import('../leave');
    await leaveApi.getEligibility();
    expect(mockGet).toHaveBeenCalledWith('/leave/eligibility');
  });

  it('updateStatus calls PUT /leave/:id/status', async () => {
    mockPut.mockResolvedValue({});
    const { leaveApi } = await import('../leave');
    await leaveApi.updateStatus(5, 'APPROVED');
    expect(mockPut).toHaveBeenCalledWith('/leave/5/status', { status: 'APPROVED' });
  });
});
