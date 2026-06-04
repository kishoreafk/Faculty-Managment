import { useState } from 'react';
import { motion } from 'framer-motion';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateFormat';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';
import Pagination from '../components/shared/Pagination';

export default function AdminProductLog() {
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [filter, setFilter] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: processedRequests, loading, error, refresh } = useAsync<any[]>(
    (signal) => api.get('/admin/product-requests', { signal }).then(r => {
      const data = r.data as any[];
      return data.filter((req: any) => req.status !== 'PENDING');
    }),
    []
  );

  const viewDetails = async (requestId: number) => {
    try {
      const res = await api.get('/product-requests/' + requestId);
      setSelectedRequest(res.data);
    } catch (err) {
      console.error('Failed to load request details', err);
    }
  };

  const allRequests = processedRequests || [];
  const filteredRequests = filter === 'ALL' 
    ? allRequests 
    : allRequests.filter((r: any) => r.status === filter);
  const displayRequests = filteredRequests.slice((page - 1) * pageSize, page * pageSize);

  if (loading) return <Spinner className="min-h-[400px]" />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!processedRequests) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Product Request Log</h1>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter('ALL')}
            className={'px-4 py-2 rounded-lg font-medium transition ' +
              (filter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100')}
          >
            All ({processedRequests.length})
          </button>
          <button
            onClick={() => setFilter('APPROVED')}
            className={'px-4 py-2 rounded-lg font-medium transition ' +
              (filter === 'APPROVED' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100')}
          >
            Approved ({processedRequests.filter(r => r.status === 'APPROVED').length})
          </button>
          <button
            onClick={() => setFilter('REJECTED')}
            className={'px-4 py-2 rounded-lg font-medium transition ' +
              (filter === 'REJECTED' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100')}
          >
            Rejected ({processedRequests.filter(r => r.status === 'REJECTED').length})
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Processed Requests ({filteredRequests.length})</h2>
            
            <div className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto">
              {displayRequests.map((req) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={'border rounded-lg p-4 cursor-pointer hover:shadow-md transition ' +
                    (selectedRequest?.id === req.id ? 'border-blue-500 bg-blue-50' : '')}
                  onClick={() => viewDetails(req.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">{req.faculty_name}</h3>
                      <p className="text-sm text-gray-600">{req.faculty_email}</p>
                    </div>
                    <span className={'text-xs px-2 py-1 rounded font-medium ' +
                      (req.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                      {req.status}
                    </span>
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <p className="text-gray-600">{req.department} | Qty: {req.quantity}</p>
                    <p className="text-xs text-gray-500 mt-2">Reviewed: {formatDateTime(req.reviewed_at)}</p>
                  </div>
                </motion.div>
              ))}
              
              {filteredRequests.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No processed requests
                </div>
              )}
            </div>
            <Pagination page={page} pageSize={pageSize} total={filteredRequests.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            {selectedRequest ? (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Request Details</h2>
                
                <div className={'p-4 rounded-lg ' +
                  (selectedRequest.status === 'APPROVED' ? 'bg-green-50 border-2 border-green-500' : 'bg-red-50 border-2 border-red-500')}>
                  <p className="text-lg font-bold mb-1">{selectedRequest.status}</p>
                  <p className="text-sm">Reviewed by: <span className="font-medium">{selectedRequest.admin_name}</span></p>
                  <p className="text-xs text-gray-600 mt-1">{formatDateTime(selectedRequest.reviewed_at)}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 text-blue-600">Faculty Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
                    <div>
                      <span className="text-gray-600">Name:</span>
                      <p className="font-medium">{selectedRequest.faculty_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Employee ID:</span>
                      <p className="font-medium">{selectedRequest.employee_id}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Department:</span>
                      <p className="font-medium">{selectedRequest.department}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Designation:</span>
                      <p className="font-medium">{selectedRequest.designation}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-gray-600">Email:</span>
                      <p className="font-medium">{selectedRequest.email}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 text-blue-600">Product Details</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-gray-600">Item Name:</span>
                      <p className="font-medium text-lg">{selectedRequest.item_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Quantity:</span>
                      <p className="font-medium text-lg">{selectedRequest.quantity}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Requested On:</span>
                      <p className="font-medium">{formatDateTime(selectedRequest.created_at)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Reason:</span>
                      <p className="mt-1 bg-white p-3 rounded border">{selectedRequest.reason}</p>
                    </div>
                  </div>
                </div>

                <div className={'p-4 rounded-lg border-2 ' +
                  (selectedRequest.status === 'APPROVED' ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300')}>
                  <h3 className="font-semibold mb-3">Review Comments</h3>
                  <p className="text-sm mb-2">{selectedRequest.admin_reason}</p>
                  <div className="text-xs text-gray-600 mt-3 pt-3 border-t">
                    <p>Reviewed by: <span className="font-medium">{selectedRequest.admin_name}</span></p>
                    <p>Date: {formatDateTime(selectedRequest.reviewed_at)}</p>
                  </div>
                </div>
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
