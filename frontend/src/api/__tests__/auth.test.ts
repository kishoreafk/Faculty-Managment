import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPost = vi.fn();
const mockGet = vi.fn();
const mockCreate = vi.fn(() => ({
  post: mockPost,
  get: mockGet,
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));

vi.mock('axios', () => ({ default: { create: mockCreate } }));

beforeEach(() => { vi.clearAllMocks(); });

describe('authApi', () => {
  it('login calls POST /auth/login', async () => {
    mockPost.mockResolvedValue({ data: { token: 'abc' } });
    const { authApi } = await import('../auth');
    const res = await authApi.login('test@example.com', 'secret');
    expect(mockPost).toHaveBeenCalledWith('/auth/login', { email: 'test@example.com', password: 'secret' });
    expect(res.data).toEqual({ token: 'abc' });
  });

  it('getFacultyTypes calls GET /auth/faculty-types', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 1, name: 'Teaching' }] });
    const { authApi } = await import('../auth');
    const res = await authApi.getFacultyTypes();
    expect(mockGet).toHaveBeenCalledWith('/auth/faculty-types');
    expect(res.data).toHaveLength(1);
  });

  it('logout calls POST /auth/logout', async () => {
    mockPost.mockResolvedValue({});
    const { authApi } = await import('../auth');
    await authApi.logout();
    expect(mockPost).toHaveBeenCalledWith('/auth/logout');
  });
});
