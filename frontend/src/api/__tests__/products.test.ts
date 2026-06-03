import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockCreate = vi.fn(() => ({
  get: mockGet, post: mockPost, put: mockPut,
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));

vi.mock('axios', () => ({ default: { create: mockCreate } }));

beforeEach(() => { vi.clearAllMocks(); });

describe('productsApi', () => {
  it('getAll calls GET /admin/products', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { productsApi } = await import('../products');
    await productsApi.getAll({ page: 1, pageSize: 10, status: 'PENDING' });
    expect(mockGet).toHaveBeenCalledWith('/admin/products', { params: { page: 1, pageSize: 10, status: 'PENDING' } });
  });

  it('getById calls GET /admin/products/:id', async () => {
    mockGet.mockResolvedValue({ data: { id: 1 } });
    const { productsApi } = await import('../products');
    await productsApi.getById(1);
    expect(mockGet).toHaveBeenCalledWith('/admin/products/1');
  });

  it('review calls PUT /admin/products/:id/review', async () => {
    mockPut.mockResolvedValue({});
    const { productsApi } = await import('../products');
    await productsApi.review(1, 'APPROVED', 'Good');
    expect(mockPut).toHaveBeenCalledWith('/admin/products/1/review', { action: 'APPROVED', reason: 'Good' });
  });

  it('create calls POST /products', async () => {
    mockPost.mockResolvedValue({ data: { id: 1 } });
    const { productsApi } = await import('../products');
    await productsApi.create({ item_name: 'Laptop', quantity: 2, reason: 'Lab' });
    expect(mockPost).toHaveBeenCalledWith('/products', { item_name: 'Laptop', quantity: 2, reason: 'Lab' });
  });

  it('getMyRequests calls GET /products/my', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { productsApi } = await import('../products');
    await productsApi.getMyRequests();
    expect(mockGet).toHaveBeenCalledWith('/products/my');
  });
});
