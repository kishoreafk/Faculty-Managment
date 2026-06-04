import { useState } from 'react';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateFormat';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';
import Pagination from '../components/shared/Pagination';

export default function Vaultify() {
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category_id: '',
    visibility: 'PRIVATE',
    file: null as File | null
  });

  const { data: files, loading: loadingFiles, error: errorFiles, refresh: refreshFiles } = useAsync<any[]>(
    (signal) => api.get('/vaultify/my', { signal }).then(r => (r.data as any).files),
    []
  );

  const { data: categories, loading: loadingCategories } = useAsync<any[]>(
    (signal) => api.get('/vaultify/categories', { signal }).then(r => r.data as any[]),
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
    data.append('category_id', formData.category_id);
    data.append('visibility', formData.visibility);

    try {
      await api.post('/vaultify/upload', data);
      alert('File uploaded successfully');
      setShowUpload(false);
      setFormData({ title: '', description: '', category_id: '', visibility: 'PRIVATE', file: null });
      refreshFiles();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (id: number) => {
    window.open(`${api.defaults.baseURL}/vaultify/files/${id}/download`, '_blank');
  };

  const handlePreview = async (id: number) => {
    try {
      const res = await api.get(`/vaultify/files/${id}/preview`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
    } catch (error) {
      alert('Failed to preview file');
    }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await api.delete(`/vaultify/files/${id}`);
      alert('File deleted successfully');
      refreshFiles();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete file');
    }
  };

  const displayFiles = (files || []).slice((page - 1) * pageSize, page * pageSize);

  if (loadingFiles && loadingCategories) return <Spinner className="min-h-[400px]" />;
  if (errorFiles) return <ErrorBlock message={errorFiles} onRetry={refreshFiles} />;

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <h1 className="text-xl sm:text-3xl font-bold">Vaultify - Document Safe</h1>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 self-stretch sm:self-auto text-sm sm:text-base"
          >
            {showUpload ? 'Cancel' : 'Upload Document'}
          </button>
        </div>

        {showUpload && (
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow mb-6">
            <h2 className="text-lg sm:text-xl font-semibold mb-4">Upload New Document</h2>
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
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select Category</option>
                  {categories && categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
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
            <h2 className="text-xl font-semibold">My Documents</h2>
          </div>
          {loadingFiles ? (
            <Spinner className="min-h-[200px]" />
          ) : !files || files.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No documents uploaded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium">Title</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden sm:table-cell">Category</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden sm:table-cell">File</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-medium hidden md:table-cell">Size</th>
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
                      <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm hidden sm:table-cell">{file.category_name || '-'}</td>
                      <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm hidden sm:table-cell">{file.original_filename}</td>
                      <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm hidden md:table-cell">{file.file_size_kb} KB</td>
                      <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm hidden md:table-cell">{formatDateTime(file.uploaded_at)}</td>
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
