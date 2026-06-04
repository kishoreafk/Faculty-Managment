import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle } from 'lucide-react';
import api from '../utils/api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

export default function AdminApprovals() {
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<{[key: number]: string}>({});
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<number | null>(null);

  const { data: pending, loading, error, refresh } = useAsync<any[]>(
    (signal) => api.get('/admin/pending-faculty', { signal }).then(r => {
      const data = r.data as any[];
      const roles: {[key: number]: string} = {};
      data.forEach((f: any) => roles[f.id] = 'FACULTY');
      setSelectedRole(roles);
      return data;
    }),
    []
  );

  const handleApprove = async (id: number) => {
    const role = selectedRole[id] || 'FACULTY';
    if (!confirm(`Approve this faculty as ${role}? Leave balances will be auto-assigned.`)) return;
    setActionLoading(true);
    try {
      await api.put(`/admin/faculty/${id}/approve`, { role });
      alert('Faculty approved successfully!');
      await refresh();
      window.dispatchEvent(new Event('notificationUpdate'));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Approval failed');
    }
    setActionLoading(false);
  };

  const handleReject = async (id: number) => {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }
    setActionLoading(true);
    try {
      await api.put(`/admin/faculty/${id}/reject`, { reason: rejectReason });
      alert('Faculty registration rejected');
      setShowRejectModal(null);
      setRejectReason('');
      await refresh();
      window.dispatchEvent(new Event('notificationUpdate'));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Rejection failed');
    }
    setActionLoading(false);
  };

  if (loading) return <Spinner className="min-h-[400px]" />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!pending) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Pending Faculty Approvals</h1>
        
        {pending.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
            No pending approvals
          </div>
        ) : (
          <div className="grid gap-4">
            {pending.map((faculty: any, idx) => (
              <motion.div
                key={faculty.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white p-4 sm:p-6 rounded-lg shadow"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="flex-1 w-full sm:w-auto">
                    <h3 className="text-lg sm:text-xl font-semibold">{faculty.name}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 mt-3 text-sm">
                      <div><span className="text-gray-500">Employee ID:</span> {faculty.employee_id}</div>
                      <div><span className="text-gray-500">Email:</span> {faculty.email}</div>
                      <div><span className="text-gray-500">Department:</span> {faculty.department}</div>
                      <div><span className="text-gray-500">Designation:</span> {faculty.designation}</div>
                      <div><span className="text-gray-500">Faculty Type:</span> {faculty.faculty_type_name}</div>
                      <div><span className="text-gray-500">Date of Joining:</span> {faculty.doj}</div>
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Assign Role:</label>
                      <select
                        value={selectedRole[faculty.id] || 'FACULTY'}
                        onChange={(e) => setSelectedRole({...selectedRole, [faculty.id]: e.target.value})}
                        className="w-full sm:w-auto px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="FACULTY">FACULTY</option>
                        <option value="HOD">HOD</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => handleApprove(faculty.id)}
                      disabled={actionLoading}
                      className="flex-1 sm:flex-none items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex"
                    >
                      <CheckCircle size={18} />
                      Approve
                    </button>
                    <button
                      onClick={() => setShowRejectModal(faculty.id)}
                      disabled={actionLoading}
                      className="flex-1 sm:flex-none items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex"
                    >
                      <XCircle size={18} />
                      Reject
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4"
          >
            <h3 className="text-xl font-bold mb-4">Reject Faculty Registration</h3>
            <p className="text-gray-600 mb-4">Please provide a reason for rejection:</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              rows={4}
              placeholder="Enter reason for rejection..."
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Confirm Reject
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectReason('');
                }}
                disabled={actionLoading}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
