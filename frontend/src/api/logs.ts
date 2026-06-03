import api from '../utils/api';

export const logsApi = {
  getAll(params?: { page?: number; pageSize?: number; action?: string; userId?: number; startDate?: string; endDate?: string }) {
    return api.get('/admin/logs', { params });
  },

  getById(id: number) {
    return api.get(`/admin/logs/${id}`);
  },

  export(params?: { action?: string; startDate?: string; endDate?: string }) {
    return api.get('/admin/logs/export', { params, responseType: 'blob' });
  },
};
