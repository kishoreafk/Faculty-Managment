import { useState } from 'react';
import api from '../utils/api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

export default function AdminTimetableAssignment() {
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: files, loading: loadingFiles, error: errorFiles, refresh: refreshFiles } = useAsync<any[]>(
    (signal) => api.get('/admin/timetables', { signal }).then(r => (r.data as any).files),
    []
  );

  const { data: faculty, loading: loadingFaculty, error: errorFaculty, refresh: refreshFaculty } = useAsync<any[]>(
    (signal) => api.get('/admin/faculty', { signal }).then(r => r.data),
    []
  );

  const handleAssign = async (fileId: number, facultyId: number) => {
    if (!confirm('Assign this timetable to the selected faculty?')) return;

    try {
      await api.post('/admin/timetables/assign', { fileId, facultyId });
      alert('Timetable assigned successfully');
      refreshFiles();
      refreshFaculty();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Assignment failed');
    }
  };

  const handleUnassign = async (facultyId: number) => {
    if (!confirm('Unassign the current timetable from this faculty?')) return;

    try {
      await api.post('/admin/timetables/unassign', { facultyId });
      alert('Timetable unassigned successfully');
      refreshFiles();
      refreshFaculty();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Unassignment failed');
    }
  };

  const handlePreview = (id: number) => {
    window.open(api.defaults.baseURL + '/timetables/' + id + '/preview', '_blank');
  };

  const filteredFiles = (files || []).filter(file => 
    (!selectedFaculty || file.faculty_id.toString() === selectedFaculty) &&
    (!searchQuery || 
      file.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.faculty_name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  if (loadingFiles || loadingFaculty) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Spinner className="min-h-[400px]" />
      </div>
    );
  }
  if (errorFiles) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <ErrorBlock message={errorFiles} onRetry={refreshFiles} />
      </div>
    );
  }
  if (errorFaculty) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <ErrorBlock message={errorFaculty} onRetry={refreshFaculty} />
      </div>
    );
  }
  if (!files || !faculty) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Spinner className="min-h-[400px]" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Timetable Assignment Management</h1>

        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <h2 className="text-xl font-semibold mb-4">Faculty Timetable Status</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">Faculty Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Department</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Assigned Timetable</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {faculty.map(fac => {
                  const assignedFile = files.find(f => f.id === fac.assigned_timetable_file_id);
                  return (
                    <tr key={fac.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{fac.name}</td>
                      <td className="px-4 py-3">{fac.department}</td>
                      <td className="px-4 py-3">
                        {assignedFile ? (
                          <div>
                            <div className="font-medium text-green-600">{assignedFile.title}</div>
                            <div className="text-sm text-gray-500">{assignedFile.original_filename}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">Not assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {fac.assigned_timetable_file_id ? (
                          <button
                            onClick={() => handleUnassign(fac.id)}
                            className="text-red-600 hover:underline text-sm"
                          >
                            Unassign
                          </button>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-xl font-semibold mb-4">All Timetable Files</h2>
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Search by title or faculty name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 border rounded px-3 py-2"
              />
              <select
                value={selectedFaculty}
                onChange={(e) => setSelectedFaculty(e.target.value)}
                className="border rounded px-3 py-2"
              >
                <option value="">All Faculty</option>
                {faculty.map(fac => (
                  <option key={fac.id} value={fac.id}>{fac.name}</option>
                ))}
              </select>
            </div>
          </div>
          {loadingFiles ? (
            <Spinner className="min-h-[200px]" />
          ) : filteredFiles.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No timetable files found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Title</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Uploaded By</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Department</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Year/Sem</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredFiles.map(file => (
                    <tr key={file.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{file.title}</div>
                        <div className="text-sm text-gray-500">{file.original_filename}</div>
                      </td>
                      <td className="px-4 py-3">{file.faculty_name}</td>
                      <td className="px-4 py-3">{file.department}</td>
                      <td className="px-4 py-3 text-sm">
                        {file.year || '-'} / {file.semester || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {file.assigned_timetable_file_id === file.id ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                            Assigned
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            Not Assigned
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm space-x-2">
                        <button
                          onClick={() => handlePreview(file.id)}
                          className="text-blue-600 hover:underline"
                        >
                          Preview
                        </button>
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssign(file.id, parseInt(e.target.value));
                              e.target.value = '';
                            }
                          }}
                          className="text-sm border rounded px-2 py-1"
                        >
                          <option value="">Assign to...</option>
                          {faculty.map(fac => (
                            <option key={fac.id} value={fac.id}>{fac.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  );
}
