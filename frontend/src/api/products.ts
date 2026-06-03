import api from '../utils/api';

export const productsApi = {
  getAll(params?: { page?: number; pageSize?: number; status?: string }) {
    return api.get('/admin/products', { params });
  },

  getById(id: number) {
    return api.get(`/admin/products/${id}`);
  },

  review(id: number, action: string, reason: string) {
    return api.put(`/admin/products/${id}/review`, { action, reason });
  },

  create(data: { item_name: string; quantity: number; reason: string }) {
    return api.post('/products', data);
  },

  getMyRequests() {
    return api.get('/products/my');
  },
};
