import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import api from '../utils/api';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

export default function AdminProductReview() {
  const navigate = useNavigate();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | null>(null);

  const { data: requests, loading, error, refresh } = useAsync<any[]>(
    (signal) => api.get('/admin/product-requests', { signal }).then(r => {
      const data = r.data as any[];
      return data.filter((req: any) => req.status === 'PENDING');
    }),
    []
  );

  const handleReview = async (action: 'APPROVED' | 'REJECTED') => {
    if (!selectedRequest || selectedRequest.status !== 'PENDING') return;
    setReviewAction(action);
    setReason('');
    setShowReasonModal(true);
  };

  const submitReview = async () => {
    if (!reason.trim()) {
      alert('Please provide a reason');
      return;
    }

    
    setActionLoading(true);
    try {
      await api.put(`/admin/product-requests/${selectedRequest.id}/review`, { action: reviewAction, reason });
      alert(`Request ${reviewAction?.toLowerCase()}`);
      
      const res = await api.get(`/product-requests/${selectedRequest.id}`);
      setSelectedRequest(res.data);
      refresh();
      setShowReasonModal(false);
      setReason('');
      window.dispatchEvent(new Event('notificationUpdate'));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Review failed');
    }
    setActionLoading(false);
  };

  if (loading) return <Spinner className="min-h-[400px]" />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!requests) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Product Request Reviews</h1>
          <button
            onClick={() => navigate('/admin/product-log')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
          >
            📋 View Product Request Log
          </button>
        </div>

        {requests.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
            No pending requests
          </div>
        ) : (
          <div className="grid gap-4">
            {requests.map((req: any, idx) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`bg-white p-6 rounded-lg shadow ${
                  req.status === 'APPROVED' ? 'border-l-4 border-l-green-500' :
                  req.status === 'REJECTED' ? 'border-l-4 border-l-red-500' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-semibold">{req.item_name}</h3>
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        req.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {req.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                      <div><span className="text-gray-500">Faculty:</span> {req.faculty_name}</div>
                      <div><span className="text-gray-500">Department:</span> {req.department}</div>
                      <div><span className="text-gray-500">Quantity:</span> {req.quantity}</div>
                      <div><span className="text-gray-500">Date:</span> {formatDate(req.created_at)}</div>
                      <div className="col-span-2"><span className="text-gray-500">Reason:</span> {req.reason}</div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const res = await api.get(`/product-requests/${req.id}`);
                      setSelectedRequest(res.data);
                    }}
                    className="ml-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    View Details
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {selectedRequest && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
            >
              <h2 className="text-xl font-bold mb-4">Request Details</h2>
              <div className="mb-4">
                <p className="font-medium text-lg">{selectedRequest.item_name}</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div><span className="text-gray-500">Faculty:</span> {selectedRequest.faculty_name}</div>
                  <div><span className="text-gray-500">Employee ID:</span> {selectedRequest.employee_id}</div>
                  <div><span className="text-gray-500">Department:</span> {selectedRequest.department}</div>
                  <div><span className="text-gray-500">Designation:</span> {selectedRequest.designation}</div>
                  <div><span className="text-gray-500">Email:</span> {selectedRequest.email}</div>
                  <div><span className="text-gray-500">Quantity:</span> {selectedRequest.quantity}</div>
                  <div><span className="text-gray-500">Requested on:</span> {formatDateTime(selectedRequest.created_at)}</div>
                </div>
                <div className="mt-3">
                  <span className="text-gray-500 text-sm">Reason:</span>
                  <p className="text-sm text-gray-700 mt-1 bg-gray-50 p-3 rounded">{selectedRequest.reason}</p>
                </div>
              </div>
              
              {selectedRequest.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReview('APPROVED')}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle size={18} /> Approve
                  </button>
                  <button
                    onClick={() => handleReview('REJECTED')}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    <XCircle size={18} /> Reject
                  </button>
                </div>
              ) : (
                <div className={`p-4 rounded-lg mb-4 ${
                  selectedRequest.status === 'APPROVED' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  <p className="font-medium mb-2">Status: {selectedRequest.status}</p>
                  <p className="text-sm text-gray-600">Reviewed by: {selectedRequest.admin_name}</p>
                  {selectedRequest.admin_reason && (
                    <p className="text-sm mt-2">Comments: {selectedRequest.admin_reason}</p>
                  )}
                  {selectedRequest.reviewed_at && (
                    <p className="text-xs text-gray-500 mt-1">Reviewed at: {formatDateTime(selectedRequest.reviewed_at)}</p>
                  )}
                </div>
              )}
              
              <button
                onClick={() => { setSelectedRequest(null); }}
                className="w-full mt-2 bg-gray-300 py-2 rounded-lg hover:bg-gray-400"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}

        {/* Reason Modal */}
        {showReasonModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
            >
              <h2 className="text-xl font-bold mb-4">
                {reviewAction === 'APPROVED' ? 'Approve' : 'Reject'} Product Request
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Please provide a reason for {reviewAction?.toLowerCase()} this product request.
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason..."
                className="w-full border rounded-lg p-3 mb-4 min-h-[100px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={submitReview}
                  disabled={actionLoading || !reason.trim()}
                  className={`flex-1 py-2 rounded-lg font-medium text-white transition disabled:opacity-50 ${
                    reviewAction === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {actionLoading ? 'Processing...' : 'Confirm'}
                </button>
                <button
                  onClick={() => {
                    setShowReasonModal(false);
                    setReason('');
                  }}
                  disabled={actionLoading}
                  className="flex-1 bg-gray-300 py-2 rounded-lg hover:bg-gray-400 transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
