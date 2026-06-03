import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lock, Edit2, Info } from 'lucide-react';
import { usersApi } from '../api/users';
import { leaveApi } from '../api/leave';
import EditUserModal from '../components/admin/EditUserModal';
import LeaveDiagnosticsTable from '../components/admin/LeaveDiagnosticsTable';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [forceReset, setForceReset] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [reassignResult, setReassignResult] = useState<any>(null);
  const [balanceEdit, setBalanceEdit] = useState<{ leave_type_id: number; name: string; code: string; currentBalance: number } | null>(null);
  const [newBalance, setNewBalance] = useState('');
  const [balanceReason, setBalanceReason] = useState('');

  const { data: user, loading, error, refresh } = useAsync(
    () => usersApi.getById(Number(id)).then(r => r.data),
    [id]
  );

  const { data: leaveBalances, refresh: refreshBalances } = useAsync<any[]>(
    () => id ? leaveApi.getFacultyBalance(Number(id)).then(r => r.data) : Promise.resolve([]),
    [id]
  );

  const handleChangePassword = async () => {
    try {
      await usersApi.updateCredentials(Number(id), { password, forceReset, reason: 'Password reset by admin' });
      alert('Password updated'); setShowPasswordModal(false); setPassword('');
    } catch { alert('Failed to update password'); }
  };

  const handlePromote = async () => {
    if (!selectedRole) return;
    try {
      await usersApi.promote(Number(id), selectedRole);
      alert('Role updated'); setShowRoleModal(false); setSelectedRole(''); refresh();
    } catch { alert('Failed to update role'); }
  };

  const handleForceLogout = async () => {
    if (!confirm('Force logout this user?')) return;
    try { await usersApi.forceLogout(Number(id)); alert('Logged out'); }
    catch { alert('Failed'); }
  };

  const handleSaveBalance = async () => {
    if (!balanceEdit || !id) return;
    const val = parseFloat(newBalance);
    if (isNaN(val) || val < 0) { alert('Enter a valid non-negative number'); return; }
    try {
      await leaveApi.updateFacultyBalance({
        faculty_id: Number(id),
        leave_type_id: balanceEdit.leave_type_id,
        new_balance: val,
        reason: balanceReason.trim() || 'Manual adjustment by admin'
      });
      alert('Leave balance updated');
      setBalanceEdit(null);
      setNewBalance('');
      setBalanceReason('');
      refreshBalances();
    } catch { alert('Failed to update leave balance'); }
  };

  const handleReassignLeaves = async () => {
    if (!id) return;
    if (!confirm('Re-run leave assignment stored procedure? This recalculates balances based on current rules and DOJ.')) return;
    setReassigning(true); setReassignResult(null);
    try {
      const { data } = await usersApi.reassignLeaves(Number(id));
      setReassignResult(data);
      refresh();
    } catch (e: any) {
      setReassignResult({ diagnostic: { status: 'ERROR', message: e.response?.data?.error || e.message } });
    } finally { setReassigning(false); }
  };

  if (loading) return <Spinner className="min-h-[400px]" />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!user) return <div className="p-6 text-center text-red-600">User not found</div>;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <button onClick={() => navigate('/admin/users')} className="text-blue-600 hover:text-blue-800 text-sm">&larr; Back to Users</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  {user.name}
                  {Boolean(user.imported) && <Lock className="w-5 h-5 text-purple-500" />}
                </h1>
                <p className="text-sm text-gray-500">{user.employee_id} &middot; {user.email}</p>
              </div>
              <button onClick={() => setShowEditModal(true)} className="px-3 py-2 bg-blue-600 text-white rounded text-sm inline-flex items-center gap-1">
                <Edit2 className="w-4 h-4" /> Edit
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {[
                ['Role', user.role_name], ['Faculty Type', user.faculty_type_name],
                ['Department', user.department || '-'], ['Designation', user.designation || '-'],
                ['Gender', user.gender || '-'], ['DOJ', user.doj || '-'],
                ['Experience', (user.experience_years ?? 0) + ' years'], ['Qualification', user.qualification || '-'],
                ['Status', user.active ? (user.approved ? 'Active' : 'Pending Approval') : 'Inactive'],
                ['Imported', user.imported ? 'Yes' : 'No']
              ].map(([label, value]) => (
                <div key={label}>
                  <span className="text-gray-500">{label}</span>
                  <p className="font-medium">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-500" /> Leave Rule Diagnostics
            </h2>
            <LeaveDiagnosticsTable diagnostics={user.leave_diagnostics || []} loading={false} />
            <button onClick={handleReassignLeaves} disabled={reassigning}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
              {reassigning ? 'Reassigning...' : 'Reassign Leaves'}
            </button>
            {reassignResult && (
              <div className={'mt-3 p-3 rounded text-sm ' + (reassignResult.diagnostic?.status === 'OK' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200')}>
                {reassignResult.message || reassignResult.diagnostic?.message}
              </div>
            )}
          </div>

          {user.pending_leave && user.pending_leave.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-3">Pending Leave Applications ({user.pending_leave.length})</h2>
              {user.pending_leave.map((l: any) => (
                <div key={l.id} className="border-b py-2 text-sm flex justify-between">
                  <span>{l.leave_type} &middot; {l.start_date} to {l.end_date}</span>
                  <span className="text-yellow-600 font-medium">{l.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-3 text-sm">Actions</h3>
            <div className="space-y-2">
              <button onClick={() => setShowPasswordModal(true)} className="w-full px-3 py-2 bg-gray-100 rounded text-sm hover:bg-gray-200">Change Password</button>
              <button onClick={() => setShowRoleModal(true)} className="w-full px-3 py-2 bg-gray-100 rounded text-sm hover:bg-gray-200">Change Role</button>
              <button onClick={handleForceLogout} className="w-full px-3 py-2 bg-orange-100 text-orange-800 rounded text-sm hover:bg-orange-200">Force Logout</button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-3 text-sm">Leave Balances</h3>
            {(!leaveBalances || leaveBalances.length === 0) ? (
              <p className="text-xs text-gray-500">No leave balances recorded.</p>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {leaveBalances.map((lb: any) => (
                  <div key={lb.leave_type_id} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                    <div>
                      <span className="font-medium">{lb.code || lb.name}</span>
                      <span className="text-gray-400 ml-1 text-xs">{lb.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{lb.balance} ({lb.available} avail)</span>
                      <button
                        onClick={() => { setBalanceEdit({ leave_type_id: lb.leave_type_id, name: lb.name, code: lb.code || lb.name, currentBalance: lb.balance }); setNewBalance(String(lb.balance)); setBalanceReason(''); }}
                        className="text-blue-600 hover:text-blue-800 text-xs px-1"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Change Password</h2>
            <input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded mb-3 text-sm" />
            <label className="flex items-center gap-2 text-sm mb-4">
              <input type="checkbox" checked={forceReset} onChange={(e) => setForceReset(e.target.checked)} />
              Force password reset on next login
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowPasswordModal(false)} className="flex-1 px-4 py-2 bg-gray-200 rounded text-sm">Cancel</button>
              <button onClick={handleChangePassword} disabled={!password} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">Update</button>
            </div>
          </div>
        </div>
      )}

      {showRoleModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Change Role: {user.name}</h2>
            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="w-full px-3 py-2 border rounded mb-4 text-sm">
              <option value="">Select role...</option>
              <option value="FACULTY">Faculty</option>
              <option value="HOD">HOD</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowRoleModal(false)} className="flex-1 px-4 py-2 bg-gray-200 rounded text-sm">Cancel</button>
              <button onClick={handlePromote} disabled={!selectedRole} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">Update Role</button>
            </div>
          </div>
        </div>
      )}

      <EditUserModal show={showEditModal} user={user} onClose={() => setShowEditModal(false)} onSaved={refresh} />

      {balanceEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-1">Edit Leave Balance</h2>
            <p className="text-sm text-gray-500 mb-4">{balanceEdit.name} ({balanceEdit.code})</p>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Current Balance</label>
              <p className="text-sm font-mono">{balanceEdit.currentBalance}</p>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">New Balance</label>
              <input type="number" min="0" step="0.5" value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm" />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
              <input type="text" value={balanceReason}
                onChange={(e) => setBalanceReason(e.target.value)}
                placeholder="Manual adjustment by admin"
                className="w-full px-3 py-2 border rounded text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setBalanceEdit(null)} className="flex-1 px-4 py-2 bg-gray-200 rounded text-sm">Cancel</button>
              <button onClick={handleSaveBalance} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded text-sm">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
