import api from '../utils/api';

export const authApi = {
  login(email: string, password: string) {
    return api.post('/auth/login', { email, password });
  },

  register(data: any) {
    return api.post('/auth/register', data);
  },

  logout() {
    return api.post('/auth/logout');
  },

  getProfile() {
    return api.get('/auth/profile');
  },

  getFacultyTypes() {
    return api.get('/auth/faculty-types');
  }
};
