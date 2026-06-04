import { useState } from 'react';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateFormat';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';
import Pagination from '../components/shared/Pagination';

export default function TimetableFiles() {
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    year: new Date().getFullYear().toString(),
    semester: '',
    visibility: 'PRIVATE',
    file: null as File | null
  });

  const { data: files, loading: loadingFiles, error: errorFiles, refresh: refreshFiles } = useAsync<any[]>(
    (signal) => api.get('/timetables/my', { signal }).then(r => (r.data as any).files),
    []
  );

  const { data: assignedFile, loading: loadingAssigned, error: errorAssigned } = useAsync(
    (signal) => api.get('/timetables/assigned/me', { signal }).then(r => {
      const d = r.data as any;
      return d.assigned ? d.file : null;
    }),
    []
  );

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file) {
      alert('Please select a file');
      return;
    }

    setUploading(true);
    const data = new FormData();
    data.append('file', formData.file);
    data.append('title', formData.title);
    data.append('description', formData.description);
    data.append('year', formData.year);
    data.append('semester', formData.semester);
    data.append('visibility', formData.visibility);

    try {
      await api.post('/timetables/upload', data);
      alert('Timetable uploaded successfully');
      setShowUpload(false);
      setFormData({ 
        title: '', 
        description: '', 
        year: new Date().getFullYear().toString(), 
        semester: '', 
        visibility: 'PRIVATE', 
        file: null 
      });
      refreshFiles();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (id: number) => {
    window.open(`${api.defaults.baseURL}/timetables/${id}/download`, '_blank');
  };

  const handlePreview = async (id: number) => {
    try {
      const res = await api.get(`/timetables/${id}/preview`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
    } catch (error) {
      alert('Failed to preview file');
    }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await api.delete(`/timetables/${id}`);
      alert('Timetable deleted successfully');
      refreshFiles();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete timetable');
    }
  };

  if (loadingFiles || loadingAssigned) return <Spinner className="min-h-[400px]" />;
  if (errorFiles) return <ErrorBlock message={errorFiles} onRetry={refreshFiles} />;
  if (errorAssigned) return <ErrorBlock message={errorAssigned} />;
  const displayFiles = (files || []).slice((page - 1) * pageSize, page * pageSize);
  if (!files) return null;

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <h1 className="text-xl sm:text-3xl font-bold">My Timetables</h1>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 self-stretch sm:self-auto text-sm sm:text-base"
          >
            {showUpload ? 'Cancel' : 'Upload Timetable'}
          </button>
        </div>

        {assignedFile && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <h2 className="text-lg font-semibold text-green-800 mb-2">Official Assigned Timetable</h2>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <p className="font-medium">{assignedFile.title}</p>
                <p className="text-sm text-gray-600">{assignedFile.original_filename}</p>
                <p className="text-sm text-gray-500">
                  Year: {assignedFile.year} | Semester: {assignedFile.semester || 'N/A'}
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                {(assignedFile.mime_type?.includes('pdf') || assignedFile.mime_type?.includes('image')) && (
                  <button
                    onClick={() => handlePreview(assignedFile.assigned_timetable_file_id)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm flex-1 sm:flex-none"
                  >
                    Preview
                  </button>
                )}
                <button
                  onClick={() => handleDownload(assignedFile.assigned_timetable_file_id)}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm flex-1 sm:flex-none"
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        )}

        {showUpload && (
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow mb-6">
            <h2 className="text-lg sm:text-xl font-semibold mb-4">Upload New Timetable</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Year</label>
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Semester</label>
                  <input
                    type="text"
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., Fall, Spring, 1, 2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Visibility</label>
                <select
                  value={formData.visibility}
                  onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="PRIVATE">Private</option>
                  <option value="DEPARTMENT">Department</option>
                  <option value="PUBLIC">Public</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">File *</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <button
                type="submit"
                disabled={uploading}
                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </form>
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-xl font-semibold">My Uploaded Timetables</h2>
          </div>
          {loadingFiles ? (
            <Spinner className="min-h-[200px]" />
          ) : files.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No timetables uploaded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium">Title</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden sm:table-cell">File</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden md:table-cell">Year</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden md:table-cell">Sem</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden sm:table-cell">Size</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden md:table-cell">Uploaded</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayFiles.map(file => (
                    <tr key={file.id} className="hover:bg-gray-50">
                      <td className="px-2 sm:px-4 py-3">
                        <div className="font-medium text-sm">{file.title}</div>
                        {file.description && (
                          <div className="text-xs text-gray-500">{file.description}</div>
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm hidden sm:table-cell">{file.original_filename}</td>
                      <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm hidden md:table-cell">{file.year || '-'}</td>
                      <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm hidden md:table-cell">{file.semester || '-'}</td>
                      <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm hidden sm:table-cell">{file.file_size_kb} KB</td>
                      <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm hidden md:table-cell">{formatDateTime(file.created_at)}</td>
                      <td className="px-2 sm:px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(file.mime_type.includes('pdf') || file.mime_type.includes('image')) && (
                            <button
                              onClick={() => handlePreview(file.id)}
                              className="text-blue-600 hover:underline text-xs"
                            >
                              Preview
                            </button>
                          )}
                          <button
                            onClick={() => handleDownload(file.id)}
                            className="text-green-600 hover:underline text-xs"
                          >
                            Download
                          </button>
                          <button
                            onClick={() => handleDelete(file.id, file.title)}
                            className="text-red-600 hover:underline text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {files && files.length > 0 && <Pagination page={page} pageSize={pageSize} total={files.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />}
        </div>
      </div>
  );
}
