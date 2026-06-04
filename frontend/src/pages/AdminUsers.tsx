import { useState } from 'react';
import { Lock, Upload, Download } from 'lucide-react';
import api from '../utils/api';
import { usersApi } from '../api/users';
import BulkImportModal from '../components/admin/BulkImportModal';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';
import Pagination from '../components/shared/Pagination';

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [role, setRole] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);

  const { data: usersData, loading, error, refresh } = useAsync(
    () => usersApi.getAll({ query, status, role, page, pageSize }).then(r => r.data),
    [page, pageSize, status, role, query]
  );

  const users = usersData?.items || [];
  const total = usersData?.total || 0;

  const handleSearch = () => { setPage(1); };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    const reason = prompt('Reason:');
    try { await usersApi.delete(id, reason || undefined); refresh(); }
    catch { alert('Failed to delete user'); }
  };

  const handleRestore = async (id: number) => {
    try { await usersApi.restore(id); refresh(); }
    catch { alert('Failed to restore user'); }
  };

  const handleForceLogout = async (id: number) => {
    if (!confirm('Force logout?')) return;
    try { await usersApi.forceLogout(id); alert('Logged out'); }
    catch { alert('Failed'); }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.length === 0) return;
    if (!confirm("Delete " + selectedUsers.length + " users?")) return;
    const reason = prompt('Reason:');
    try { await usersApi.bulkDelete(selectedUsers, reason || undefined); setSelectedUsers([]); refresh(); }
    catch { alert('Failed'); }
  };

  const handlePermanentDelete = async (id: number) => {
    if (!confirm('PERMANENT DELETE - cannot be undone. Continue?')) return;
    const reason = prompt('Reason:');
    try { await api.delete('/admin/users/' + id + '/permanent', { data: { reason } }); alert('Deleted'); refresh(); }
    catch (e: any) { alert(e.response?.data?.error || 'Failed'); }
  };

  const handleBulkPermanentDelete = async () => {
    if (selectedUsers.length === 0) return;
    if (!confirm('Permanently delete ' + selectedUsers.length + ' users?')) return;
    const reason = prompt('Reason:');
    try { await api.post('/admin/users/bulk-permanent-delete', { ids: selectedUsers, reason }); alert('Deleted'); setSelectedUsers([]); refresh(); }
    catch { alert('Failed'); }
  };

  const handleApprove = async (id: number) => {
    if (!confirm('Approve this user?')) return;
    try { await usersApi.approve(id); alert('Approved'); refresh(); window.dispatchEvent(new Event('notificationUpdate')); }
    catch (e: any) { alert(e.response?.data?.error || 'Failed'); }
  };

  const handleReject = async (id: number) => {
    if (!confirm('Reject? Will permanently remove user.')) return;
    const reason = prompt('Reason:');
    try { await usersApi.reject(id, reason || undefined); alert('Rejected'); refresh(); window.dispatchEvent(new Event('notificationUpdate')); }
    catch (e: any) { alert(e.response?.data?.error || 'Failed'); }
  };

  const handleBulkApprove = async () => {
    if (selectedUsers.length === 0) return;
    if (!confirm('Approve ' + selectedUsers.length + ' users?')) return;
    try { await usersApi.bulkApprove(selectedUsers); alert('Approved'); setSelectedUsers([]); refresh(); window.dispatchEvent(new Event('notificationUpdate')); }
    catch { alert('Failed'); }
  };

  const toggleSelect = (id: number) => {
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]);
  };

  const handleDownloadSample = async () => {
    try {
      const { data } = await usersApi.downloadSample();
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url; link.setAttribute('download', 'faculty_bulk_import_template.xlsx');
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    } catch { alert('Failed to download'); }
  };

  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold">User Management</h1>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleDownloadSample} className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm inline-flex items-center gap-2">
              <Download className="w-4 h-4" /> Sample Format
            </button>
            <button onClick={() => setShowImportModal(true)} className="px-3 sm:px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm inline-flex items-center gap-2">
              <Upload className="w-4 h-4" /> Import Excel
            </button>
            <button onClick={() => window.location.href = '/admin/users/create'} className="px-4 sm:px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
              + Create User
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input type="text" placeholder="Search by name, email, or employee ID" value={query}
            onChange={(e) => setQuery(e.target.value)} className="flex-1 px-3 sm:px-4 py-2 border rounded text-sm" />
          <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Search</button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border rounded text-sm">
            <option value="active">Active</option><option value="deleted">Deleted</option><option value="inactive">Inactive</option><option value="">All</option>
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="px-3 py-2 border rounded text-sm">
            <option value="">All Roles</option><option value="FACULTY">Faculty</option><option value="ADMIN">Admin</option><option value="HOD">HOD</option>
          </select>
          {selectedUsers.length > 0 && (
            <>
              <button onClick={handleBulkApprove} className="px-3 py-2 bg-green-600 text-white rounded text-sm">Approve ({selectedUsers.length})</button>
              <button onClick={handleBulkDelete} className="px-3 py-2 bg-red-600 text-white rounded text-sm">Delete ({selectedUsers.length})</button>
              <button onClick={handleBulkPermanentDelete} className="px-3 py-2 bg-black text-white rounded text-sm">Permanent ({selectedUsers.length})</button>
            </>
          )}
        </div>
      </div>

      {loading ? <Spinner className="min-h-[200px]" /> : (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 sm:px-4 py-3 text-left">
                      <input type="checkbox" onChange={(e) => setSelectedUsers(e.target.checked ? users.map(u => u.id) : [])}
                        checked={selectedUsers.length === users.length && users.length > 0} className="rounded" />
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-700">Name</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-700 hidden md:table-cell">Email</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-700">Role</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-700 hidden lg:table-cell">Department</th>
                    <th className="px-3 sm:px-4 py-3 text-center text-xs sm:text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id} className={'hover:bg-gray-50 ' + (!user.approved ? 'bg-yellow-50' : '') + (user.imported ? ' bg-purple-50/40' : '')}>
                      <td className="px-3 sm:px-4 py-3">
                        <input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={() => toggleSelect(user.id)} className="rounded" />
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{user.name}</div>
                            <div className="text-xs text-gray-500 md:hidden">{user.email}</div>
                          </div>
                          {!user.approved && <span className="inline-flex px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-xs font-bold">PENDING</span>}
                          {Boolean(user.imported) && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-200 text-purple-800 rounded text-xs font-bold" title="Added via bulk import. Use Edit on detail page to modify.">
                              <Lock className="w-3 h-3" /> LOCKED
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-sm hidden md:table-cell">{user.email}</td>
                      <td className="px-3 sm:px-4 py-3"><span className="inline-flex px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">{user.role_name}</span></td>
                      <td className="px-3 sm:px-4 py-3 text-sm hidden lg:table-cell">{user.department}</td>
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex flex-col sm:flex-row gap-1 justify-center">
                          {!user.approved ? (
                            <>
                              <button onClick={() => handleApprove(user.id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Approve</button>
                              <button onClick={() => handleReject(user.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Reject</button>
                            </>
                          ) : user.deleted ? (
                            <button onClick={() => handleRestore(user.id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Restore</button>
                          ) : (
                            <>
                              <button onClick={() => window.location.href = '/admin/users/' + user.id} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">View</button>
                              <button onClick={() => handleForceLogout(user.id)} className="px-2 py-1 bg-orange-600 text-white rounded text-xs hidden sm:inline-block">Logout</button>
                              <button onClick={() => handleDelete(user.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Delete</button>
                              <button onClick={() => handlePermanentDelete(user.id)} className="px-2 py-1 bg-black text-white rounded text-xs">Permanent</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
        </>
      )}

      <BulkImportModal show={showImportModal} onClose={() => setShowImportModal(false)} onSuccess={refresh} />
    </div>
  );
}
