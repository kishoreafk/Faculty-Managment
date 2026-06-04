import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Package, Plus } from 'lucide-react';
import api from '../utils/api';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';
import Pagination from '../components/shared/Pagination';

export default function ProductRequests() {
  const [showForm, setShowForm] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { register, handleSubmit, reset } = useForm();

  const { data: requestsData, loading, error, refresh } = useAsync(
    (signal) => api.get('/product-requests/my', { signal }).then(r => r.data),
    []
  );

  const requests = requestsData;
  const displayRequests = (requests || []).slice((page - 1) * pageSize, page * pageSize);

  const onSubmit = async (data: any) => {
    try {
      await api.post('/product-requests', data);
      alert('Request submitted successfully');
      reset();
      setShowForm(false);
      refresh();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to submit request');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-green-100 text-green-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const deleteRequest = async (id: number) => {
    if (!confirm('Are you sure you want to delete this request?')) return;
    
    try {
      await api.delete(`/product-requests/${id}`);
      alert('Request deleted successfully');
      refresh();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete request');
    }
  };

  const viewDetails = async (req: any) => {
    try {
      const res = await api.get(`/product-requests/${req.id}`);
      setSelectedRequest(res.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to load details');
    }
  };

  if (loading) return <Spinner className="min-h-[400px]" />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!requests) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 sm:w-8 sm:h-8" /> Product Requests
          </h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm sm:text-base"
          >
            <Plus size={18} /> New Request
          </button>
        </div>

        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-4 sm:p-6 rounded-lg shadow mb-6"
          >
            <h2 className="text-lg sm:text-xl font-semibold mb-4">Create Product Request</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Item Name</label>
                <input {...register('item_name')} className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Quantity</label>
                <input {...register('quantity')} type="number" min="1" className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Reason/Purpose</label>
                <textarea {...register('reason')} className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" rows={3} required />
              </div>
              <div className="sm:col-span-2 flex flex-col sm:flex-row gap-2">
                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium">
                  Submit
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 font-medium">
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-700">Item</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-700">Qty</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-700">Status</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-700 hidden md:table-cell">Admin Response</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-700 hidden lg:table-cell">Date</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayRequests.map((req: any) => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="font-medium text-sm">{req.item_name}</div>
                      <div className="text-xs text-gray-500 mt-1">{req.reason}</div>
                      <div className="text-xs text-gray-400 mt-1 lg:hidden">
                        {formatDate(req.created_at)}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium">{req.quantity}</td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStatusColor(req.status)}`}>
                        {req.status}
                      </span>
                      {req.admin_reason && (
                        <div className="text-xs text-gray-600 mt-1 md:hidden">
                          <div className="font-medium">{req.admin_name}</div>
                          <div>{req.admin_reason}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 hidden md:table-cell">
                      {req.admin_reason ? (
                        <div className="text-sm">
                          <div className="font-medium">{req.admin_name}</div>
                          <div className="text-gray-600">{req.admin_reason}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-500 hidden lg:table-cell">
                      {formatDate(req.created_at)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => viewDetails(req)}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          View
                        </button>
                        {req.status === 'PENDING' && (
                          <button
                            onClick={() => deleteRequest(req.id)}
                            className="text-red-600 hover:underline text-sm"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {requests.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">No product requests yet</div>
          )}
          {requests.length > 0 && <Pagination page={page} pageSize={pageSize} total={requests.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />}
        </div>
      </div>

      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedRequest(null)}>
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">Product Request Details</h2>
              <button onClick={() => setSelectedRequest(null)} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-medium">Item:</span> {selectedRequest.item_name}</div>
                <div><span className="font-medium">Quantity:</span> {selectedRequest.quantity}</div>
                <div><span className="font-medium">Status:</span> <span className={`px-2 py-1 rounded text-xs ${getStatusColor(selectedRequest.status)}`}>{selectedRequest.status}</span></div>
                <div><span className="font-medium">Date:</span> {formatDate(selectedRequest.created_at)}</div>
              </div>
              
              <div>
                <p className="font-medium mb-1">Reason:</p>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">{selectedRequest.reason}</p>
              </div>

              {selectedRequest.status !== 'PENDING' && selectedRequest.admin_reason && (
                <div className={`p-4 rounded-lg ${
                  selectedRequest.status === 'APPROVED' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  <p className="font-medium mb-2">
                    {selectedRequest.status === 'APPROVED' ? '✓ Approved' : '✗ Rejected'} by {selectedRequest.admin_name || 'Admin'}
                  </p>
                  <p className="text-sm text-gray-700 mb-1"><span className="font-medium">Reason:</span></p>
                  <p className="text-sm text-gray-700 bg-white p-3 rounded">{selectedRequest.admin_reason}</p>
                  {selectedRequest.reviewed_at && (
                    <p className="text-xs text-gray-500 mt-2">Reviewed at: {formatDateTime(selectedRequest.reviewed_at)}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
