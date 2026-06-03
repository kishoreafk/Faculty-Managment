import { useState } from 'react';
import { Package, FileText } from 'lucide-react';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateFormat';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

export default function AdminPendingItems() {
  const [tab, setTab] = useState<'leave' | 'product'>('leave');
  const [modal, setModal] = useState<{ id: number; action: 'APPROVED' | 'REJECTED'; type: 'leave' | 'product' } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const { data: currentData, loading, error, refresh } = useAsync<any[]>(
    (signal) => {
      const endpoint = tab === 'leave' ? '/admin/pending/leave' : '/admin/pending/product';
      return api.get(endpoint, { signal }).then(r => r.data as any[]);
    },
    [tab]
  );

  const leaveApps: any[] = tab === 'leave' ? (currentData || []) : [];
  const productReqs: any[] = tab === 'product' ? (currentData || []) : [];

  const submitReview = async () => {
    if (!modal) return;
    if (!reasonInput.trim()) { alert('Reason is required'); return; }

    try {
      const endpoint = modal.type === 'leave' ? '/admin/leave/' + modal.id + '/review' : '/admin/product/' + modal.id + '/review';
      await api.put(endpoint, { action: modal.action, reason: reasonInput.trim() });
      alert((modal.type === 'leave' ? 'Leave' : 'Product request') + ' ' + modal.action.toLowerCase() + ' successfully');
      setModal(null);
      setReasonInput('');
      await refresh();
      window.dispatchEvent(new Event('notificationUpdate'));
    } catch (error: any) {
      alert(error.response?.data?.error || error.message || 'Failed to review');
    }
  };

  const openModal = (id: number, action: 'APPROVED' | 'REJECTED', type: 'leave' | 'product') => {
    setModal({ id, action, type });
    setReasonInput('');
  };

  if (loading) return <Spinner className="min-h-[400px]" />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-secondary-900">Pending Items</h1>
          <p className="text-secondary-600 mt-1">Review and manage pending requests</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={'w-3 h-3 rounded-full ' + (tab === 'leave' ? 'bg-accent-500' : 'bg-primary-500')}></div>
          <span className="text-sm font-medium text-secondary-700 capitalize">{tab} Requests</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <button
          onClick={() => setTab('leave')}
          className={'btn ' + (tab === 'leave' ? 'btn-primary' : 'btn-secondary') + ' flex-1 sm:flex-none'}
        >
          Leave Applications
        </button>
        <button
          onClick={() => setTab('product')}
          className={'btn ' + (tab === 'product' ? 'btn-primary' : 'btn-secondary') + ' flex-1 sm:flex-none'}
        >
          Product Requests
        </button>
      </div>

      <>
        {tab === 'product' && (
          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Faculty</th>
                    <th className="hidden lg:table-cell">Department</th>
                    <th>Item</th>
                    <th className="text-center">Qty</th>
                    <th className="hidden md:table-cell">Reason</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {productReqs.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <div>
                          <p className="font-semibold text-secondary-900">{req.faculty_name}</p>
                          <p className="text-sm text-secondary-600">{req.email}</p>
                          <p className="text-xs text-secondary-500 lg:hidden mt-1">{req.department}</p>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell text-secondary-700">{req.department}</td>
                      <td>
                        <p className="font-semibold text-secondary-900">{req.item_name}</p>
                        <p className="text-sm text-secondary-600 md:hidden mt-1">{req.reason}</p>
                      </td>
                      <td className="text-center">
                        <span className="badge badge-info">{req.quantity}</span>
                      </td>
                      <td className="hidden md:table-cell text-secondary-600">{req.reason}</td>
                      <td>
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                          <button
                            onClick={() => openModal(req.id, 'APPROVED', 'product')}
                            className="btn btn-success text-xs px-3 py-1"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => openModal(req.id, 'REJECTED', 'product')}
                            className="btn btn-danger text-xs px-3 py-1"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {productReqs.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
                <p className="text-secondary-500">No pending product requests</p>
              </div>
            )}
          </div>
        )}

        {tab === 'leave' && (
          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Faculty</th>
                    <th className="hidden lg:table-cell">Department</th>
                    <th>Leave Type</th>
                    <th className="hidden md:table-cell">Dates</th>
                    <th className="text-center">Days</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveApps.map((app) => (
                    <tr key={app.id}>
                      <td>
                        <div>
                          <p className="font-semibold text-secondary-900">{app.faculty_name}</p>
                          <p className="text-sm text-secondary-600">{app.email}</p>
                          <p className="text-xs text-secondary-500 lg:hidden mt-1">{app.department}</p>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell text-secondary-700">{app.department}</td>
                      <td>
                        <span className="badge badge-info">{app.leave_type}</span>
                        <div className="text-xs text-secondary-600 mt-1 md:hidden">
                          <div>{formatDateTime(app.start_date)}</div>
                          <div>to {formatDateTime(app.end_date)}</div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell">
                        <div className="text-sm text-secondary-900">
                          <p>{formatDateTime(app.start_date)}</p>
                          <p className="text-secondary-600">to {formatDateTime(app.end_date)}</p>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className="font-semibold text-secondary-900">{app.total_days}</span>
                      </td>
                      <td>
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                          <button
                            onClick={() => openModal(app.id, 'APPROVED', 'leave')}
                            className="btn btn-success text-xs px-3 py-1"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => openModal(app.id, 'REJECTED', 'leave')}
                            className="btn btn-danger text-xs px-3 py-1"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {leaveApps.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
                <p className="text-secondary-500">No pending leave applications</p>
              </div>
            )}
          </div>
        )}


      </>
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">
              {modal.action === 'APPROVED' ? 'Approve' : 'Reject'} {modal.type === 'leave' ? 'Leave' : 'Product Request'}
            </h3>
            <label className="block text-sm font-medium mb-1">Reason *</label>
            <textarea
              className="w-full px-4 py-2 border rounded min-h-[80px]"
              value={reasonInput}
              onChange={e => setReasonInput(e.target.value)}
              placeholder="Enter reason for this action..."
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button onClick={submitReview} className="btn btn-primary flex-1">Submit</button>
              <button onClick={() => setModal(null)} className="btn btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
