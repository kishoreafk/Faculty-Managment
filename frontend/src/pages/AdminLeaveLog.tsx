import { useState } from 'react';
import { motion } from 'framer-motion';
import api from '../utils/api';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

export default function AdminLeaveLog() {
  const [selectedLeave, setSelectedLeave] = useState<any>(null);
  const [filter, setFilter] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');

  const { data: processedLeaves, loading, error, refresh } = useAsync<any[]>(
    (signal) => api.get('/leave/pending', { signal }).then(r => {
      const data = r.data as any[];
      return data.filter((l: any) => l.status === 'APPROVED' || l.status === 'REJECTED');
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

  const allLeaves = processedLeaves || [];
  const filteredLeaves = filter === 'ALL' 
    ? allLeaves 
    : allLeaves.filter((l: any) => l.status === filter);

  if (loading) return <Spinner className="min-h-[400px]" />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!processedLeaves) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Leave Request Log</h1>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter('ALL')}
            className={'px-4 py-2 rounded-lg font-medium transition ' +
              (filter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100')}
          >
            All ({processedLeaves.length})
          </button>
          <button
            onClick={() => setFilter('APPROVED')}
            className={'px-4 py-2 rounded-lg font-medium transition ' +
              (filter === 'APPROVED' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100')}
          >
            Approved ({processedLeaves.filter(l => l.status === 'APPROVED').length})
          </button>
          <button
            onClick={() => setFilter('REJECTED')}
            className={'px-4 py-2 rounded-lg font-medium transition ' +
              (filter === 'REJECTED' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100')}
          >
            Rejected ({processedLeaves.filter(l => l.status === 'REJECTED').length})
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Processed Requests ({filteredLeaves.length})</h2>
            
            <div className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto">
              {filteredLeaves.map((leave) => (
                <motion.div
                  key={leave.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={'border rounded-lg p-4 cursor-pointer hover:shadow-md transition ' +
                    (selectedLeave?.id === leave.id ? 'border-blue-500 bg-blue-50' : '') + ' ' +
                    (leave.status === 'APPROVED' ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500')}
                  onClick={() => viewDetails(leave.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">{leave.faculty_name}</h3>
                      <p className="text-sm text-gray-600">{leave.department} | {leave.designation}</p>
                    </div>
                    <span className={'text-xs px-2 py-1 rounded font-medium ' +
                      (leave.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                      {leave.status}
                    </span>
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <p><span className="font-medium">{leave.leave_type}</span> - {Math.floor(leave.total_days)} days</p>
                    <p className="text-gray-600">{formatDate(leave.start_date)} to {formatDate(leave.end_date)}</p>
                    <p className="text-xs text-gray-500 mt-2">Reviewed: {formatDateTime(leave.reviewed_at)}</p>
                  </div>
                </motion.div>
              ))}
              
              {filteredLeaves.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No processed requests
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            {selectedLeave ? (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Request Details</h2>
                
                <div className={'p-4 rounded-lg ' +
                  (selectedLeave.status === 'APPROVED' ? 'bg-green-50 border-2 border-green-500' : 'bg-red-50 border-2 border-red-500')}>
                  <p className="text-lg font-bold mb-1">{selectedLeave.status}</p>
                  <p className="text-sm">Reviewed by: <span className="font-medium">{selectedLeave.reviewer_name}</span></p>
                  <p className="text-xs text-gray-600 mt-1">{formatDateTime(selectedLeave.reviewed_at)}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 text-blue-600">Faculty Information</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-600">Name:</span>
                      <p className="font-medium">{selectedLeave.faculty_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Employee ID:</span>
                      <p className="font-medium">{selectedLeave.employee_id}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Department:</span>
                      <p className="font-medium">{selectedLeave.department}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Designation:</span>
                      <p className="font-medium">{selectedLeave.designation}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-600">Email:</span>
                      <p className="font-medium">{selectedLeave.email}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Category:</span>
                      <p className="font-medium">{selectedLeave.faculty_category}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 text-blue-600">Leave Details</h3>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-3">
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
                        <p className="font-medium">{formatDate(selectedLeave.start_date)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">End Date:</span>
                        <p className="font-medium">{formatDate(selectedLeave.end_date)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Total Days:</span>
                        <p className="font-medium text-lg">{Math.floor(selectedLeave.total_days)}</p>
                      </div>
                    </div>
                    
                    {selectedLeave.contact_during_leave && selectedLeave.contact_during_leave !== '0' && (
                      <div className="text-sm">
                        <span className="text-gray-600">Contact:</span>
                        <p className="font-medium">{selectedLeave.contact_during_leave}</p>
                      </div>
                    )}

                    {selectedLeave.is_during_exam === 1 && (
                      <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
                        ⚠️ During exam/academic event
                      </div>
                    )}

                    <div>
                      <span className="text-gray-600">Reason:</span>
                      <p className="mt-1 bg-white p-3 rounded border">{selectedLeave.reason}</p>
                    </div>

                    {selectedLeave.remarks && (
                      <div>
                        <span className="text-gray-600">Remarks:</span>
                        <p className="mt-1 bg-white p-3 rounded border">{selectedLeave.remarks}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className={'p-4 rounded-lg border-2 ' +
                  (selectedLeave.status === 'APPROVED' ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300')}>
                  <h3 className="font-semibold mb-3">Review Comments</h3>
                  <p className="text-sm mb-2">{selectedLeave.review_reason}</p>
                  <div className="text-xs text-gray-600 mt-3 pt-3 border-t">
                    <p>Reviewed by: <span className="font-medium">{selectedLeave.reviewer_name}</span></p>
                    <p>Date: {formatDateTime(selectedLeave.reviewed_at)}</p>
                  </div>
                </div>

                {selectedLeave.adjustments && selectedLeave.adjustments.length > 0 && (
                  <div className="border-t pt-4">
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
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a request to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
