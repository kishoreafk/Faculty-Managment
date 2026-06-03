import api from '../utils/api';
import { User, UserDetail, PaginatedResponse, ImportResult } from '../types/models';

export const usersApi = {
  getAll(params?: { query?: string; status?: string; role?: string; department?: string; page?: number; pageSize?: number }) {
    return api.get<PaginatedResponse<User>>('/admin/users', { params });
  },

  getById(id: number) {
    return api.get<UserDetail>(`/admin/users/${id}`);
  },

  create(data: any) {
    return api.post('/admin/users', data);
  },

  update(id: number, data: any) {
    return api.put(`/admin/users/${id}`, data);
  },

  delete(id: number, reason?: string) {
    return api.delete(`/admin/users/${id}`, { data: { reason } });
  },

  bulkDelete(ids: number[], reason?: string) {
    return api.post('/admin/users/bulk-delete', { ids, reason });
  },

  restore(id: number) {
    return api.post(`/admin/users/${id}/restore`);
  },

  promote(id: number, role: string) {
    return api.post(`/admin/users/${id}/promote`, { role });
  },

  forceLogout(id: number) {
    return api.post(`/admin/users/${id}/force-logout`);
  },

  updateCredentials(id: number, data: { password?: string; forceReset?: boolean; reason?: string }) {
    return api.put(`/admin/users/${id}/credentials`, data);
  },

  reassignLeaves(id: number) {
    return api.post(`/admin/users/${id}/reassign-leaves`);
  },

  approve(id: number) {
    return api.post(`/admin/users/${id}/approve`);
  },

  reject(id: number, reason?: string) {
    return api.post(`/admin/users/${id}/reject`, { reason });
  },

  bulkApprove(ids: number[]) {
    return api.post('/admin/users/bulk-approve', { ids });
  },

  bulkImport(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ImportResult>('/admin/users/bulk-import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000
    });
  },

  downloadSample() {
    return api.get('/admin/users/sample-format', { responseType: 'blob' });
  }
};

export const pendingApi = {
  getPendingLeaves() {
    return api.get('/admin/pending/leave');
  },

  getPendingProducts() {
    return api.get('/admin/pending/product');
  },

  reviewLeave(id: number, action: string, reason: string) {
    return api.put(`/admin/leave/${id}/review`, { action, reason });
  },

  reviewProduct(id: number, action: string, reason: string) {
    return api.put(`/admin/product/${id}/review`, { action, reason });
  }
};
