import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateFormat';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

export default function AdminLeaveReview() {
  const navigate = useNavigate();
  const [selectedLeave, setSelectedLeave] = useState<any>(null);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const { data: pendingLeaves, loading, error, refresh } = useAsync<any[]>(
    (signal) => api.get('/leave/pending', { signal }).then(r => {
      const data = r.data as any[];
      return data.filter((l: any) => l.status === 'PENDING');
    }),
    []
  );

  const viewDetails = async (leaveId: number) => {
    try {
      const res = await api.get('/leave/' + leaveId);
      setSelectedLeave(res.data);
    } catch (err) {
      console.error('Failed to load leave details', err);
    }
  };

  const handleReview = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedLeave || selectedLeave.status !== 'PENDING') return;
    
    if (selectedLeave.adjustments && selectedLeave.adjustments.length > 0) {
      const pendingCount = selectedLeave.adjustments.filter((a: any) => a.confirmation_status === 'PENDING').length;
      if (pendingCount > 0 && status === 'APPROVED') {
        if (!confirm('There are ' + pendingCount + ' pending adjustment confirmations. Approve anyway?')) {
          return;
        }
      }
    }
    
    setReviewAction(status);
    setReasonText('');
    setShowReasonModal(true);
  };

  const submitReview = async () => {
    if (!reasonText.trim()) {
      alert('Please provide a reason');
      return;
    }

    try {
      setActionLoading(true);
      await api.put('/leave/' + selectedLeave.id + '/status', {
        status: reviewAction,
        reason: reasonText
      });
      alert('Leave ' + reviewAction?.toLowerCase() + ' successfully');
      
      const res = await api.get('/leave/' + selectedLeave.id);
      setSelectedLeave(res.data);
      refresh();
      setShowReasonModal(false);
      setReasonText('');
      window.dispatchEvent(new Event('notificationUpdate'));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update leave status');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Spinner className="min-h-[400px]" />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!pendingLeaves) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Leave Applications Review</h1>
          <button
            onClick={() => navigate('/admin/leave-log')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
          >
            📋 View Leave Request Log
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pending List */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Pending Applications ({pendingLeaves.length})</h2>
            
            <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
              {pendingLeaves.map((leave) => (
                <motion.div
                  key={leave.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={'border rounded-lg p-4 cursor-pointer hover:shadow-md transition ' +
                    (selectedLeave?.id === leave.id ? 'border-blue-500 bg-blue-50' : '')}
                  onClick={() => viewDetails(leave.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">{leave.faculty_name}</h3>
                      <p className="text-sm text-gray-600">{leave.department} | {leave.designation}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {leave.faculty_category}
                      </span>
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">
                        PENDING
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <p><span className="font-medium">{leave.leave_type}</span> - {Math.floor(leave.total_days)} days</p>
                    <p className="text-gray-600">{leave.start_date} to {leave.end_date}</p>
                    {leave.adjustments && leave.adjustments.length > 0 && (
                      <p className="text-xs text-blue-600 mt-2">
                        📋 {leave.adjustments.length} alternate arrangement(s)
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {pendingLeaves.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No pending applications
                </div>
              )}
            </div>
          </div>

          {/* Details Panel */}
          <div className="bg-white rounded-lg shadow p-6">
            {selectedLeave ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-4">Application Details</h2>
                  
                  {/* Faculty Info */}
                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <h3 className="font-semibold mb-2">Faculty Information</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-600">Name:</span> {selectedLeave.faculty_name}</div>
                      <div><span className="text-gray-600">Employee ID:</span> {selectedLeave.employee_id}</div>
                      <div><span className="text-gray-600">Department:</span> {selectedLeave.department}</div>
                      <div><span className="text-gray-600">Designation:</span> {selectedLeave.designation}</div>
                      <div><span className="text-gray-600">Email:</span> {selectedLeave.email}</div>
                      <div><span className="text-gray-600">Type:</span> {selectedLeave.faculty_category}</div>
                    </div>
                  </div>

                  {/* Leave Details */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Leave Type:</span>
                        <p className="font-medium">{selectedLeave.leave_type}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Category:</span>
                        <p className="font-medium">{selectedLeave.leave_category}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Start Date:</span>
                        <p className="font-medium">{selectedLeave.start_date}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">End Date:</span>
                        <p className="font-medium">{selectedLeave.end_date}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Total Days:</span>
                        <p className="font-medium">{Math.floor(selectedLeave.total_days)}</p>
                      </div>
                    </div>
                    
                    {selectedLeave.contact_during_leave && selectedLeave.contact_during_leave !== '0' && (
                      <div className="text-sm">
                        <span className="text-gray-600">Contact:</span>
                        <p className="font-medium">{selectedLeave.contact_during_leave}</p>
                      </div>
                    )}

                    {selectedLeave.is_during_exam === 1 && (
                      <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm">
                        ⚠️ This leave overlaps with exam duty or academic event
                      </div>
                    )}

                    <div>
                      <span className="text-gray-600 text-sm">Reason:</span>
                      <p className="mt-1 text-sm bg-gray-50 p-3 rounded">{selectedLeave.reason}</p>
                    </div>

                    {selectedLeave.remarks && (
                      <div>
                        <span className="text-gray-600 text-sm">Additional Remarks:</span>
                        <p className="mt-1 text-sm bg-gray-50 p-3 rounded">{selectedLeave.remarks}</p>
                      </div>
                    )}
                  </div>

                  {/* Alternate Arrangements */}
                  {selectedLeave.adjustments && selectedLeave.adjustments.length > 0 && (
                    <div className="mt-6 border-t pt-4">
                      <h3 className="font-semibold mb-3">Alternate Faculty Arrangements</h3>
                      <div className="space-y-3">
                        {selectedLeave.adjustments.map((adj: any) => (
                          <div key={adj.id} className="bg-gray-50 p-3 rounded-lg border">
                            <div className="flex justify-between items-start mb-2">
                              <div className="text-sm">
                                <p className="font-medium">{adj.adjustment_date} | {adj.period}</p>
                                <p className="text-gray-600">{adj.subject_code} - {adj.class_section}</p>
                                {adj.room_no && <p className="text-gray-500 text-xs">Room: {adj.room_no}</p>}
                              </div>
                              <span className={'text-xs px-2 py-1 rounded ' +
                                (adj.confirmation_status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                                adj.confirmation_status === 'DECLINED' ? 'bg-red-100 text-red-700' :
                                'bg-yellow-100 text-yellow-700')}>
                                {adj.confirmation_status}
                              </span>
                            </div>
                            <div className="text-sm border-t pt-2 mt-2">
                              <p className="font-medium text-blue-600">{adj.alternate_faculty_name}</p>
                              <p className="text-gray-600 text-xs">{adj.alternate_designation} | {adj.alternate_department}</p>
                              <p className="text-gray-500 text-xs">{adj.alternate_email}</p>
                              {adj.remarks && (
                                <p className="text-xs text-gray-600 mt-1 italic">Note: {adj.remarks}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Review Section */}
                {selectedLeave.status === 'PENDING' ? (
                  <div className="border-t pt-4">
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleReview('APPROVED')}
                        disabled={actionLoading}
                        className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-medium disabled:bg-gray-400"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => handleReview('REJECTED')}
                        disabled={actionLoading}
                        className="flex-1 bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition font-medium disabled:bg-gray-400"
                      >
                        ✗ Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-t pt-4">
                    <div className={'p-4 rounded-lg ' +
                      (selectedLeave.status === 'APPROVED' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200')}>
                      <p className="font-medium mb-2">Status: {selectedLeave.status}</p>
                      <p className="text-sm text-gray-600">Reviewed by: {selectedLeave.reviewer_name}</p>
                      {selectedLeave.review_reason && (
                        <p className="text-sm mt-2">Comments: {selectedLeave.review_reason}</p>
                      )}
                      {selectedLeave.reviewed_at && (
                        <p className="text-xs text-gray-500 mt-1">Reviewed at: {formatDateTime(selectedLeave.reviewed_at)}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a leave application to review
              </div>
            )}
          </div>
        </div>

        {/* Reason Modal */}
        {showReasonModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
            >
              <h2 className="text-xl font-bold mb-4">
                {reviewAction === 'APPROVED' ? 'Approve' : 'Reject'} Leave Application
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Please provide a reason for {reviewAction?.toLowerCase()} this leave request.
              </p>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Enter reason..."
                className="w-full border rounded-lg p-3 mb-4 min-h-[100px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={submitReview}
                  disabled={actionLoading || !reasonText.trim()}
                  className={'flex-1 py-2 rounded-lg font-medium text-white transition disabled:opacity-50 ' +
                    (reviewAction === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')}
                >
                  {actionLoading ? 'Processing...' : 'Confirm'}
                </button>
                <button
                  onClick={() => {
                    setShowReasonModal(false);
                    setReasonText('');
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
