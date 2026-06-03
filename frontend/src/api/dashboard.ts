import api from '../utils/api';

export const dashboardApi = {
  getStats() {
    return api.get('/admin/dashboard/stats');
  },

  getRecentActivity() {
    return api.get('/admin/dashboard/recent-activity');
  },

  getNotifications() {
    return api.get('/admin/dashboard/notifications');
  },
};
