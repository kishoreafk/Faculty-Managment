import { useState, useRef, useEffect } from 'react';
import api from '../utils/api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';
import Pagination from '../components/shared/Pagination';

export default function AdminTimetableAssignment() {
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [facultySearch, setFacultySearch] = useState('');
  const [facultyPage, setFacultyPage] = useState(1);
  const [facultyPageSize, setFacultyPageSize] = useState(10);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '', description: '', year: new Date().getFullYear().toString(), semester: '', visibility: 'PRIVATE', file: null as File | null
  });

  // Searchable assign state
  const [assignSearch, setAssignSearch] = useState('');
  const [showAssignDropdown, setShowAssignDropdown] = useState<number | null>(null);
  const assignRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) {
        setShowAssignDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const getFilteredAssignFaculty = () => {
    if (!assignSearch.trim()) return faculty || [];
    const q = assignSearch.toLowerCase();
    return (faculty || []).filter((f: any) =>
      f.name.toLowerCase().includes(q) ||
      (f.employee_id && f.employee_id.toLowerCase().includes(q)) ||
      (f.department && f.department.toLowerCase().includes(q)) ||
      (f.designation && f.designation.toLowerCase().includes(q))
    );
  };

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

  const handleAdminUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file) { alert('Please select a file'); return; }
    setUploading(true);
    const data = new FormData();
    data.append('file', uploadForm.file);
    data.append('title', uploadForm.title);
    data.append('description', uploadForm.description);
    data.append('year', uploadForm.year);
    data.append('semester', uploadForm.semester);
    data.append('visibility', uploadForm.visibility);
    try {
      await api.post('/timetables/upload', data);
      alert('Timetable uploaded successfully');
      setShowUpload(false);
      setUploadForm({ title: '', description: '', year: new Date().getFullYear().toString(), semester: '', visibility: 'PRIVATE', file: null });
      refreshFiles();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
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
  const displayFiles = filteredFiles.slice((page - 1) * pageSize, page * pageSize);
  const fileById = new Map((files || []).map(file => [file.id, file]));
  const filteredFaculty = (faculty || []).filter((fac: any) => {
    if (!facultySearch.trim()) return true;
    const q = facultySearch.toLowerCase();
    const assignedFile = fileById.get(fac.assigned_timetable_file_id);
    return (
      fac.name?.toLowerCase().includes(q) ||
      fac.department?.toLowerCase().includes(q) ||
      assignedFile?.title?.toLowerCase().includes(q) ||
      assignedFile?.original_filename?.toLowerCase().includes(q)
    );
  });
  const facultyTotalPages = Math.max(1, Math.ceil(filteredFaculty.length / facultyPageSize));
  useEffect(() => {
    if (facultyPage > facultyTotalPages) {
      setFacultyPage(facultyTotalPages);
    }
  }, [facultyPage, facultyTotalPages]);
  const displayFaculty = filteredFaculty.slice(
    (facultyPage - 1) * facultyPageSize,
    facultyPage * facultyPageSize
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-xl sm:text-3xl font-bold">Timetable Assignment Management</h1>
        <button onClick={() => setShowUpload(!showUpload)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm sm:text-base self-stretch sm:self-auto">
          {showUpload ? 'Cancel' : 'Upload Timetable'}
        </button>
      </div>

      {showUpload && (
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">Upload New Timetable</h2>
          <form onSubmit={handleAdminUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input type="text" required value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea value={uploadForm.description}
                onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                className="w-full border rounded px-3 py-2" rows={3} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Year</label>
                <input type="number" value={uploadForm.year}
                  onChange={(e) => setUploadForm({ ...uploadForm, year: e.target.value })}
                  className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Semester</label>
                <input type="text" value={uploadForm.semester}
                  onChange={(e) => setUploadForm({ ...uploadForm, semester: e.target.value })}
                  className="w-full border rounded px-3 py-2" placeholder="e.g., Fall, Spring, 1, 2" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Visibility</label>
              <select value={uploadForm.visibility}
                onChange={(e) => setUploadForm({ ...uploadForm, visibility: e.target.value })}
                className="w-full border rounded px-3 py-2">
                <option value="PRIVATE">Private</option>
                <option value="DEPARTMENT">Department</option>
                <option value="PUBLIC">Public</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">File *</label>
              <input type="file" required
                onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                className="w-full border rounded px-3 py-2" />
            </div>
            <button type="submit" disabled={uploading}
              className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </form>
        </div>
      )}

        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">Faculty Timetable Status</h2>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              placeholder="Search by name, department, or timetable..."
              value={facultySearch}
              onChange={(e) => { setFacultySearch(e.target.value); setFacultyPage(1); }}
              className="flex-1 border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium">Faculty Name</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden sm:table-cell">Department</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium">Timetable</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayFaculty.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                      No faculty found
                    </td>
                  </tr>
                ) : (
                  displayFaculty.map(fac => {
                    const assignedFile = fileById.get(fac.assigned_timetable_file_id);
                    return (
                      <tr key={fac.id} className="hover:bg-gray-50">
                        <td className="px-2 sm:px-4 py-3 text-sm">{fac.name}</td>
                        <td className="px-2 sm:px-4 py-3 text-sm hidden sm:table-cell">{fac.department}</td>
                        <td className="px-2 sm:px-4 py-3 text-sm">
                          {assignedFile ? (
                            <div>
                              <div className="font-medium text-green-600">{assignedFile.title}</div>
                              <div className="text-sm text-gray-500">{assignedFile.original_filename}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400">Not assigned</span>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {assignedFile ? (
                              <>
                                <button
                                  onClick={() => handlePreview(assignedFile.id)}
                                  className="text-blue-600 hover:underline text-xs"
                                >
                                  Preview
                                </button>
                                <button
                                  onClick={() => handleUnassign(fac.id)}
                                  className="text-red-600 hover:underline text-xs"
                                >
                                  Unassign
                                </button>
                              </>
                            ) : (
                              <span className="text-gray-400 text-xs">No actions</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filteredFaculty.length > 0 && (
            <Pagination
              page={facultyPage}
              pageSize={facultyPageSize}
              total={filteredFaculty.length}
              onPageChange={setFacultyPage}
              onPageSizeChange={(size) => { setFacultyPageSize(size); setFacultyPage(1); }}
            />
          )}
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-lg sm:text-xl font-semibold mb-4">All Timetable Files</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Search by title or faculty name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 border rounded px-3 py-2 text-sm"
              />
              <select
                value={selectedFaculty}
                onChange={(e) => setSelectedFaculty(e.target.value)}
                className="w-full sm:w-auto border rounded px-3 py-2 text-sm"
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
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium">Title</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden md:table-cell">Uploaded By</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden sm:table-cell">Dept</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium">Year/Sem</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium">Status</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayFiles.map(file => (
                    <tr key={file.id} className="hover:bg-gray-50">
                      <td className="px-2 sm:px-4 py-3">
                        <div className="font-medium text-sm">{file.title}</div>
                        <div className="text-xs text-gray-500">{file.original_filename}</div>
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-sm hidden md:table-cell">{file.faculty_name}</td>
                      <td className="px-2 sm:px-4 py-3 text-sm hidden sm:table-cell">{file.department}</td>
                      <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm">
                        {file.year || '-'} / {file.semester || '-'}
                      </td>
                      <td className="px-2 sm:px-4 py-3">
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
                      <td className="px-2 sm:px-4 py-3">
                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 items-start sm:items-center">
                          <button
                            onClick={() => handlePreview(file.id)}
                            className="text-blue-600 hover:underline text-xs sm:text-sm"
                          >
                            Preview
                          </button>
                          <div className="relative w-full sm:w-48" ref={assignRef}>
                            <input
                              type="text"
                              placeholder="Assign to..."
                              value={showAssignDropdown === file.id ? assignSearch : ''}
                              onFocus={() => { setShowAssignDropdown(file.id); setAssignSearch(''); }}
                              onChange={(e) => setAssignSearch(e.target.value)}
                              className="w-full border rounded px-2 py-1 text-xs sm:text-sm"
                            />
                            {showAssignDropdown === file.id && (
                              <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-lg max-h-48 overflow-y-auto">
                                {getFilteredAssignFaculty().length === 0 ? (
                                  <div className="px-2 py-1 text-xs text-gray-400">No faculty found</div>
                                ) : (
                                  getFilteredAssignFaculty().map((f: any) => (
                                    <button
                                      key={f.id}
                                      type="button"
                                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 border-b last:border-b-0"
                                      onClick={() => { handleAssign(file.id, f.id); setShowAssignDropdown(null); setAssignSearch(''); }}
                                    >
                                      <div className="font-medium">{f.name}</div>
                                      <div className="text-gray-500 text-[10px]">{f.employee_id || ''} {f.department ? `- ${f.department}` : ''}</div>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filteredFiles.length > 0 && <Pagination page={page} pageSize={pageSize} total={filteredFiles.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />}
        </div>
    </div>
  );
}
