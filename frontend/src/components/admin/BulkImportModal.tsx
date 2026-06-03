import { useState, useRef } from 'react';
import { Upload, Download, X, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { usersApi } from '../../api/users';
import { ImportResult } from '../../types/models';

interface Props {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BulkImportModal({ show, onClose, onSuccess }: Props) {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!show) return null;

  const reset = () => {
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportFile(e.target.files?.[0] || null);
  };

  const handleDownloadSample = async () => {
    try {
      const response = await usersApi.downloadSample();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'faculty_bulk_import_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download sample template');
    }
  };

  const handleUpload = async () => {
    if (!importFile) { setImportError('Please choose an Excel file first.'); return; }
    if (!confirm(`Import users from "${importFile.name}"? Users will be created with default password and locked.`)) return;

    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const { data } = await usersApi.bulkImport(importFile);
      setImportResult(data);
      if (data.successCount > 0) onSuccess();
    } catch (error: any) {
      const d = error.response?.data;
      if (d?.errors) {
        setImportResult({
          message: d.error || 'Import failed',
          totalRows: d.totalRows || 0,
          successCount: d.successCount || 0,
          failedCount: d.failedCount || d.errors.length,
          defaultPassword: d.defaultPassword || 'admin123',
          insertedUsers: d.insertedUsers || [],
          errors: d.errors
        });
      } else {
        setImportError(d?.error || error.message || 'Import failed');
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Bulk Import Users</h2>
              <p className="text-xs text-gray-500">Upload an Excel file (.xlsx) to add multiple users at once.</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Before you upload</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs">
                <li>Use the sample template to keep column headers consistent.</li>
                <li>All imported users get default password and are marked Locked.</li>
                <li>Unlock and edit users from their detail page.</li>
              </ul>
            </div>
          </div>

          <div className="mb-4">
            <button onClick={handleDownloadSample} className="text-sm text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 font-medium">
              <Download className="w-4 h-4" /> Download sample template
            </button>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Excel file</span>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFileChange} disabled={importing}
              className="mt-1 block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 disabled:opacity-50" />
          </label>

          {importError && <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded text-sm">{importError}</div>}

          {importResult && (
            <div className="mt-5 space-y-4">
              <div className={`p-3 rounded-lg flex items-start gap-2 text-sm ${importResult.successCount > 0 ? 'bg-green-50 border border-green-200 text-green-900' : 'bg-red-50 border border-red-200 text-red-900'}`}>
                {importResult.successCount > 0 ? <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />}
                <div>
                  <p className="font-medium">{importResult.message}</p>
                  <p className="text-xs mt-1">{importResult.successCount} succeeded, {importResult.failedCount} failed of {importResult.totalRows} rows.</p>
                </div>
              </div>

              {importResult.insertedUsers.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Imported Users</h3>
                  <div className="max-h-48 overflow-y-auto border rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-2 py-1.5">Employee ID</th>
                          <th className="text-left px-2 py-1.5">Name</th>
                          <th className="text-left px-2 py-1.5">Email</th>
                          <th className="text-left px-2 py-1.5">Leave</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.insertedUsers.map((u) => {
                          const ld = u.leave_diagnostic;
                          const badge = !ld ? { label: 'Unknown', cls: 'bg-gray-100 text-gray-700', title: 'No diagnostic' }
                            : ld.status === 'OK' ? { label: `${ld.balances_inserted} OK`, cls: 'bg-emerald-100 text-emerald-800', title: `Matched ${ld.rules_matched}/${ld.rules_total}` }
                            : ld.status === 'NO_RULES_DEFINED' ? { label: 'No rules', cls: 'bg-red-100 text-red-800', title: ld.message }
                            : { label: ld.status, cls: 'bg-amber-100 text-amber-800', title: ld.message };
                          return (
                            <tr key={u.id} className="border-t">
                              <td className="px-2 py-1.5 font-mono">{u.employee_id}</td>
                              <td className="px-2 py-1.5">{u.name}</td>
                              <td className="px-2 py-1.5">{u.email}</td>
                              <td className="px-2 py-1.5"><span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${badge.cls}`} title={badge.title}>{badge.label}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importResult.leaveWarnings && importResult.leaveWarnings.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Leave Warnings ({importResult.leaveWarnings.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto border border-amber-200 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-50">
                        <tr><th className="text-left px-2 py-1.5">Row</th><th className="text-left px-2 py-1.5">Email</th><th className="text-left px-2 py-1.5">Warning</th></tr>
                      </thead>
                      <tbody>
                        {importResult.leaveWarnings.map((w, i) => (
                          <tr key={i} className="border-t border-amber-100">
                            <td className="px-2 py-1.5">{w.row}</td>
                            <td className="px-2 py-1.5">{w.email}</td>
                            <td className="px-2 py-1.5 text-amber-800">{w.warning}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-700 mb-2">Errors</h3>
                  <div className="max-h-48 overflow-y-auto border border-red-200 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50"><tr><th className="text-left px-2 py-1.5">Row</th><th className="text-left px-2 py-1.5">Reason</th></tr></thead>
                      <tbody>
                        {importResult.errors.map((e, i) => (
                          <tr key={i} className="border-t border-red-100">
                            <td className="px-2 py-1.5">{e.row}</td>
                            <td className="px-2 py-1.5 text-red-700">{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t bg-gray-50">
          <button onClick={handleClose} disabled={importing} className="flex-1 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50">
            {importResult ? 'Close' : 'Cancel'}
          </button>
          {!importResult && (
            <button onClick={handleUpload} disabled={!importFile || importing}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {importing ? <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                : <><Upload className="w-4 h-4" /> Upload & Import</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
