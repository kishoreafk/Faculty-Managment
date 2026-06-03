import { useState } from 'react';
import { motion } from 'framer-motion';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateFormat';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

export default function AdminLogs() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    resource_type: '',
    action_type: '',
    from: '',
    to: '',
    page: 1,
    pageSize: 50
  });

  const { data: logs, loading, error, refresh } = useAsync(
    (signal) => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value.toString());
      });
      return api.get(`/admin/logs?${params}`, { signal }).then(r => r.data);
    },
    [filters]
  );

  const getActionColor = (action: string) => {
    if (action.includes('APPROVE')) return 'text-green-600';
    if (action.includes('REJECT')) return 'text-red-600';
    if (action.includes('DELETE')) return 'text-red-600';
    if (action.includes('EDIT')) return 'text-blue-600';
    return 'text-gray-600';
  };

  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!logs) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Admin Activity Logs</h1>

        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Resource Type</label>
              <select
                value={filters.resource_type}
                onChange={(e) => setFilters({ ...filters, resource_type: e.target.value, page: 1 })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="">All</option>
                <option value="leave_application">Leave Application</option>
                <option value="product_request">Product Request</option>
                <option value="timetable">Timetable</option>
                <option value="faculty">Faculty</option>
                <option value="leave_balance">Leave Balance</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Search Action Type</label>
              <input
                type="text"
                value={filters.action_type}
                onChange={(e) => setFilters({ ...filters, action_type: e.target.value, page: 1 })}
                placeholder="e.g., APPROVE, REJECT, USER..."
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">From Date</label>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">To Date</label>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <Spinner className="min-h-[200px]" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-medium">Timestamp</th>
                      <th className="px-6 py-3 text-left text-sm font-medium">Admin</th>
                      <th className="px-6 py-3 text-left text-sm font-medium">Action</th>
                      <th className="px-6 py-3 text-left text-sm font-medium">Resource</th>
                      <th className="px-6 py-3 text-left text-sm font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs.items.map((log: any) => (
                      <motion.tr
                        key={log.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <td className="px-6 py-4 text-sm">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium">{log.admin_name}</div>
                          <div className="text-sm text-gray-500">{log.admin_email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-medium ${getActionColor(log.action_type)}`}>
                            {log.action_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div>{log.resource_type}</div>
                          <div className="text-gray-500">ID: {log.resource_id}</div>
                        </td>
                        <td className="px-6 py-4">
                          {(log.resource_type === 'leave_application' || log.resource_type === 'product_request') && log.resource_id && (
                            <button
                              onClick={() => {
                                if (log.resource_type === 'leave_application') {
                                  navigate('/admin/leave-log');
                                } else if (log.resource_type === 'product_request') {
                                  navigate('/admin/product-log');
                                }
                              }}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              View Details
                            </button>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 border-t flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Total: {logs.total} logs
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilters({ ...filters, page: Math.max(1, filters.page - 1) })}
                    disabled={filters.page === 1}
                    className="px-4 py-2 border rounded-lg disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2">Page {filters.page}</span>
                  <button
                    onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                    disabled={filters.page * filters.pageSize >= logs.total}
                    className="px-4 py-2 border rounded-lg disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
