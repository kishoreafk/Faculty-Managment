import { useState } from 'react';
import { motion } from 'framer-motion';
import api from '../utils/api';
import LeaveApplicationForm from '../components/LeaveApplicationForm';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

export default function LeaveManagement() {
  const [showForm, setShowForm] = useState(false);
  const [selectedApp, setSelectedApp] = useState<any>(null);

  const { data: balancesData, loading: loadingData, error: errorData, refresh: refreshData } = useAsync(
    (signal) => Promise.all([
      api.get('/leave/balance', { signal }).then(r => r.data),
      api.get('/leave/applications', { signal }).then(r => r.data)
    ]).then(([bal, apps]) => ({ balances: bal, applications: apps })),
    []
  );

  const { data: userProfile, loading: loadingProfile, error: errorProfile, refresh: refreshProfile } = useAsync(
    (signal) => api.get('/auth/profile', { signal }).then(r => r.data),
    []
  );

  const { data: adjustments, loading: loadingAdjustments, error: errorAdjustments, refresh: refreshAdjustments } = useAsync(
    (signal) => api.get('/leave/adjustments/my', { signal }).then(r => r.data),
    []
  );

  const balances = balancesData?.balances || [];
  const applications = balancesData?.applications || [];

  if (loadingData || loadingProfile || loadingAdjustments) return <Spinner className="min-h-[400px]" />;
  if (errorData) return <ErrorBlock message={errorData} onRetry={refreshData} />;
  if (errorProfile) return <ErrorBlock message={errorProfile} onRetry={refreshProfile} />;
  if (errorAdjustments) return <ErrorBlock message={errorAdjustments} onRetry={refreshAdjustments} />;
  if (!balancesData || !userProfile) return null;

  const handleFormSuccess = () => {
    setShowForm(false);
    refreshData();
  };

  const viewDetails = (app: any) => {
    setSelectedApp(app);
  };

  const confirmAdjustment = async (id: number, status: string) => {
    try {
      await api.put(`/leave/adjustments/${id}/confirm`, { status, remarks: '' });
      alert(`Adjustment ${status.toLowerCase()} successfully`);
      refreshAdjustments();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update adjustment');
    }
  };

  const deleteApplication = async (id: number) => {
    if (!confirm('Are you sure you want to delete this leave application?')) return;
    
    try {
      await api.delete(`/leave/${id}`);
      alert('Leave application deleted successfully');
      refreshData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete application');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6">Leave Management</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {balances.map((bal: any) => (
            <motion.div
              key={bal.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white p-4 sm:p-6 rounded-lg shadow"
            >
              <h3 className="font-semibold text-base sm:text-lg">{bal.name}</h3>
              <p className="text-2xl sm:text-3xl font-bold text-blue-600 mt-2">{Math.round(bal.balance)}</p>
              <p className="text-xs sm:text-sm text-gray-500">Available days</p>
            </motion.div>
          ))}
        </div>

        <div className="mb-6">
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium">
            {showForm ? 'Cancel' : '+ Apply for Leave'}
          </button>
        </div>

        {showForm && userProfile && (
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <h2 className="text-xl font-semibold mb-6">Leave Application Form</h2>
            <LeaveApplicationForm onSuccess={handleFormSuccess} userProfile={userProfile} />
          </div>
        )}

        {adjustments.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <h2 className="text-xl font-semibold mb-4">Pending Adjustments (Assigned to You)</h2>
            <div className="space-y-4">
              {adjustments.filter((a: any) => a.confirmation_status === 'PENDING').map((adj: any) => (
                <div key={adj.id} className="border p-4 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold">{adj.applicant_name} - {adj.leave_type}</p>
                      <p className="text-sm text-gray-600">{adj.applicant_department} | {adj.applicant_designation}</p>
                    </div>
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">PENDING</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                    <div><span className="text-gray-600">Date:</span> {adj.adjustment_date}</div>
                    <div><span className="text-gray-600">Period:</span> {adj.period}</div>
                    <div><span className="text-gray-600">Subject:</span> {adj.subject_code}</div>
                    <div><span className="text-gray-600">Class:</span> {adj.class_section}</div>
                    {adj.room_no && <div><span className="text-gray-600">Room:</span> {adj.room_no}</div>}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => confirmAdjustment(adj.id, 'CONFIRMED')} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
                      Confirm
                    </button>
                    <button onClick={() => confirmAdjustment(adj.id, 'DECLINED')} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">My Applications</h2>
          <div className="space-y-4">
            {applications.map((app: any) => (
              <div key={app.id} className="border rounded-lg p-4 hover:shadow-md transition">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{app.leave_type}</h3>
                    <p className="text-sm text-gray-600">{app.start_date} to {app.end_date} ({app.total_days} days)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded text-sm font-medium ${
                      app.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                      app.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {app.status}
                    </span>
                    {app.status === 'PENDING' && (
                      <button
                        onClick={() => deleteApplication(app.id)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-3">{app.reason}</p>
                
                {app.review_reason && app.status !== 'PENDING' && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${
                    app.status === 'APPROVED' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                  }`}>
                    <p className="font-medium mb-1">
                      {app.status === 'APPROVED' ? '✓ Approved' : '✗ Rejected'} by {app.reviewer_name || 'Admin'}
                    </p>
                    <p className="text-gray-700"><span className="font-medium">Reason:</span> {app.review_reason}</p>
                  </div>
                )}
                
                {app.adjustments && app.adjustments.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm font-medium mb-2">Alternate Arrangements ({app.adjustments.length}):</p>
                    <div className="space-y-2">
                      {app.adjustments.map((adj: any) => (
                        <div key={adj.id} className="text-xs bg-gray-50 p-2 rounded">
                          <div className="flex justify-between">
                            <span>{adj.adjustment_date} | {adj.period} | {adj.subject_code}</span>
                            <span className={`px-2 py-0.5 rounded ${
                              adj.confirmation_status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                              adj.confirmation_status === 'DECLINED' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {adj.confirmation_status}
                            </span>
                          </div>
                          <div className="text-gray-600 mt-1">{adj.alternate_faculty_name} ({adj.alternate_designation})</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <button onClick={() => viewDetails(app)} className="mt-3 text-sm text-blue-600 hover:underline">
                  View Full Details
                </button>
              </div>
            ))}
          </div>
          {applications.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">No applications yet</div>
          )}
        </div>

        {selectedApp && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedApp(null)}>
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold">Leave Application Details</h2>
                <button onClick={() => setSelectedApp(null)} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-medium">Leave Type:</span> {selectedApp.leave_type}</div>
                  <div><span className="font-medium">Status:</span> <span className={`px-2 py-1 rounded text-xs ${
                    selectedApp.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    selectedApp.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>{selectedApp.status}</span></div>
                  <div><span className="font-medium">Start Date:</span> {selectedApp.start_date}</div>
                  <div><span className="font-medium">End Date:</span> {selectedApp.end_date}</div>
                  <div><span className="font-medium">Total Days:</span> {selectedApp.total_days}</div>
                  <div><span className="font-medium">Category:</span> {selectedApp.leave_category}</div>
                  {selectedApp.contact_during_leave && (
                    <div className="col-span-2"><span className="font-medium">Contact:</span> {selectedApp.contact_during_leave}</div>
                  )}
                </div>
                
                <div>
                  <p className="font-medium mb-1">Reason:</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">{selectedApp.reason}</p>
                </div>
                
                {selectedApp.remarks && (
                  <div>
                    <p className="font-medium mb-1">Remarks:</p>
                    <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">{selectedApp.remarks}</p>
                  </div>
                )}
                
                {selectedApp.review_reason && selectedApp.status !== 'PENDING' && (
                  <div className={`p-4 rounded-lg ${
                    selectedApp.status === 'APPROVED' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                  }`}>
                    <p className="font-medium mb-2">
                      {selectedApp.status === 'APPROVED' ? '✓ Approved' : '✗ Rejected'} by {selectedApp.reviewer_name || 'Admin'}
                    </p>
                    <p className="text-sm text-gray-700 mb-1"><span className="font-medium">Reason:</span></p>
                    <p className="text-sm text-gray-700 bg-white p-3 rounded">{selectedApp.review_reason}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
