import api from '../utils/api';
import { LeaveBalance, LeaveApplication } from '../types/models';

export const leaveApi = {
  getBalance() {
    return api.get<LeaveBalance[]>('/leave/balance');
  },

  getApplications() {
    return api.get<LeaveApplication[]>('/leave/applications');
  },

  getDetails(id: number) {
    return api.get(`/leave/${id}`);
  },

  apply(data: any) {
    return api.post('/leave/apply', data);
  },

  delete(id: number) {
    return api.delete(`/leave/${id}`);
  },

  getPending() {
    return api.get('/leave/pending');
  },

  updateStatus(id: number, status: string, reason: string) {
    return api.put(`/leave/${id}/status`, { status, reason });
  },

  getHistory() {
    return api.get('/leave/history');
  },

  getEligibility() {
    return api.get('/leave/eligibility');
  },

  getAlternateFaculty(department?: string) {
    return api.get('/leave/alternate-faculty', { params: { department } });
  },

  getMyAdjustments() {
    return api.get('/leave/adjustments/my');
  },

  confirmAdjustment(id: number, status: string, remarks?: string) {
    return api.put(`/leave/adjustments/${id}/confirm`, { status, remarks });
  },

  getFacultyBalance(facultyId: number) {
    return api.get(`/admin/leave/balance/${facultyId}`);
  },

  updateFacultyBalance(data: { faculty_id: number; leave_type_id: number; new_balance: number; reason: string }) {
    return api.put('/admin/leave/balance', data);
  },

  triggerMonthlyAccrual() {
    return api.post('/admin/leave/accrual/monthly');
  },

  triggerYearlyAccrual() {
    return api.post('/admin/leave/accrual/yearly');
  },

  triggerCarryForward() {
    return api.post('/admin/leave/carry-forward');
  }
};
