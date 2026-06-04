import { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import api from '../utils/api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

interface Faculty {
  id: number;
  name: string;
  employee_id: string;
  department: string;
  designation: string;
}

interface LeaveBalance {
  leave_type_id: number;
  name: string;
  code: string;
  balance: number;
  reserved: number;
  available: number;
}

export default function AdminLeaveBalance() {
  const [selectedFaculty, setSelectedFaculty] = useState<number | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [editMode, setEditMode] = useState<number | null>(null);
  const [newBalance, setNewBalance] = useState('');
  const [reason, setReason] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: faculties, loading, error, refresh } = useAsync(
    (signal) => api.get('/admin/faculty', { signal }).then(r => r.data),
    []
  );

  const filteredFaculties = useMemo(() => {
    if (!faculties) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return faculties;
    return faculties.filter((f: Faculty) =>
      f.name.toLowerCase().includes(q) ||
      f.employee_id.toLowerCase().includes(q) ||
      (f.department || '').toLowerCase().includes(q) ||
      (f.designation || '').toLowerCase().includes(q)
    );
  }, [faculties, searchQuery]);

  const fetchBalances = async (facultyId: number) => {
    setLoadingBalances(true);
    try {
      const res = await api.get('/admin/leave/balance/' + facultyId);
      setBalances(res.data);
    } catch (error) {
      console.error('Failed to fetch balances', error);
    } finally {
      setLoadingBalances(false);
    }
  };

  const handleFacultySelect = (faculty: Faculty) => {
    setSelectedFaculty(faculty.id);
    setSearchQuery(faculty.name + ' (' + faculty.employee_id + ')');
    setShowResults(false);
    fetchBalances(faculty.id);
    setEditMode(null);
  };

  const handleClear = () => {
    setSelectedFaculty(null);
    setSearchQuery('');
    setBalances([]);
    setEditMode(null);
  };

  const handleEdit = (leaveTypeId: number, currentBalance: number) => {
    setEditMode(leaveTypeId);
    setNewBalance(currentBalance.toString());
    setReason('');
  };

  const handleUpdate = async (leaveTypeId: number) => {
    if (!reason || reason.trim().length < 10) {
      alert('Reason must be at least 10 characters');
      return;
    }

    try {
      await api.put('/admin/leave/balance', {
        faculty_id: selectedFaculty,
        leave_type_id: leaveTypeId,
        new_balance: parseFloat(newBalance),
        reason: reason.trim()
      });
      alert('Leave balance updated successfully');
      setEditMode(null);
      if (selectedFaculty) fetchBalances(selectedFaculty);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update balance');
    }
  };

  const selectedFacultyData = faculties ? faculties.find((f: Faculty) => f.id === selectedFaculty) : null;

  if (loading) return <Spinner className="min-h-[400px]" />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!faculties) return null;

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto"
      >
        <h1 className="text-xl sm:text-3xl font-bold text-gray-800 mb-6">Manage Faculty Leave Balances</h1>

        <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 mb-6" ref={searchRef}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Faculty
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name, employee ID, department, or designation..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
            />
            {selectedFaculty && (
              <button
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            )}
            {showResults && searchQuery.trim() && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredFaculties.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">No faculty found</p>
                ) : (
                  filteredFaculties.map((faculty: Faculty) => (
                    <button
                      key={faculty.id}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                      onClick={() => handleFacultySelect(faculty)}
                    >
                      <span className="font-medium">{faculty.name}</span>
                      <span className="text-sm text-gray-500 ml-2">({faculty.employee_id})</span>
                      <span className="text-sm text-gray-400 ml-2">- {faculty.department}</span>
                      {faculty.designation && (
                        <span className="text-sm text-gray-400 ml-1">| {faculty.designation}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {selectedFacultyData && (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Faculty Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <p className="font-medium">{selectedFacultyData.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Employee ID</p>
                <p className="font-medium">{selectedFacultyData.employee_id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Department</p>
                <p className="font-medium">{selectedFacultyData.department}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Designation</p>
                <p className="font-medium">{selectedFacultyData.designation}</p>
              </div>
            </div>
          </div>
        )}

        {loadingBalances && <p className="text-center text-gray-600">Loading balances...</p>}

        {!loadingBalances && balances.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg overflow-x-auto">
            <table className="min-w-[600px] sm:min-w-full w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Type</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Reserved</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Available</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {balances.map(balance => (
                  <tr key={balance.leave_type_id}>
                    <td className="px-3 sm:px-6 py-4">{balance.name}</td>
                    <td className="px-3 sm:px-6 py-4">{balance.code}</td>
                    <td className="px-3 sm:px-6 py-4">
                      {editMode === balance.leave_type_id ? (
                        <input
                          type="number"
                          step="0.5"
                          className="w-20 sm:w-24 px-2 py-1 border rounded"
                          value={newBalance}
                          onChange={(e) => setNewBalance(e.target.value)}
                        />
                      ) : (
                        balance.balance
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-4 hidden sm:table-cell">{balance.reserved}</td>
                    <td className="px-3 sm:px-6 py-4 hidden sm:table-cell">{balance.available}</td>
                    <td className="px-3 sm:px-6 py-4">
                      {editMode === balance.leave_type_id ? (
                        <div className="space-y-2 min-w-[160px]">
                          <input
                            type="text"
                            placeholder="Reason (min 10 chars)"
                            className="w-full px-2 py-1 border rounded text-sm"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                          <div className="flex gap-1 sm:gap-2">
                            <button
                              onClick={() => handleUpdate(balance.leave_type_id)}
                              className="px-2 sm:px-3 py-1 bg-green-600 text-white rounded text-xs sm:text-sm hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditMode(null)}
                              className="px-2 sm:px-3 py-1 bg-gray-400 text-white rounded text-xs sm:text-sm hover:bg-gray-500"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEdit(balance.leave_type_id, balance.balance)}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
