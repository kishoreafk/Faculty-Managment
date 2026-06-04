import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { usersApi } from '../../api/users';
import { UserDetail } from '../../types/models';

interface Props {
  show: boolean;
  user: UserDetail | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditUserModal({ show, user, onClose, onSaved }: Props) {
  const [facultyTypes, setFacultyTypes] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', department: '', designation: '',
    faculty_type_id: '', gender: '', experience_years: '', qualification: '',
    doj: '', role: ''
  });

  useEffect(() => {
    if (user) {
      const dojVal = user.doj ? user.doj.split('T')[0] : '';
      setForm({
        name: user.name || '',
        email: user.email || '',
        department: user.department || '',
        designation: user.designation || '',
        faculty_type_id: String(user.faculty_type_id || ''),
        gender: user.gender || '',
        experience_years: String(user.experience_years || 0),
        qualification: user.qualification || '',
        doj: dojVal,
        role: user.role_name || ''
      });
    }
  }, [user]);

  useEffect(() => {
    import('../../api/auth').then(({ authApi }) =>
      authApi.getFacultyTypes().then(({ data }) => setFacultyTypes(data))
    ).catch(() => {});
  }, []);

  if (!show || !user) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const skipFields = new Set(['role']);
      const payload: Record<string, any> = {};
      for (const [key, val] of Object.entries(form)) {
        if (skipFields.has(key)) continue;
        if (val !== '' && val !== undefined && val !== null) {
          if (key === 'faculty_type_id') payload[key] = Number(val);
          else if (key === 'experience_years') payload[key] = Number(val);
          else payload[key] = val;
        }
      }
      if (user.imported) payload.force_update = true;
      await usersApi.update(user.id, payload);
      alert('User updated successfully');
      onSaved();
      onClose();
    } catch (e: any) {
      const data = e.response?.data;
      if (data?.details) {
        alert(`Validation failed:\n${data.details.map((d: any) => `  • ${d.path}: ${d.message}`).join('\n')}`);
      } else {
        alert(data?.error || 'Failed to update user');
      }
    } finally {
      setSaving(false);
    }
  };

  const fields: { label: string; key: keyof typeof form; type?: string }[] = [
    { label: 'Name', key: 'name' }, { label: 'Email', key: 'email', type: 'email' },
    { label: 'Department', key: 'department' }, { label: 'Designation', key: 'designation' },
    { label: 'Experience Years', key: 'experience_years', type: 'number' },
    { label: 'Qualification', key: 'qualification' },
    { label: 'Date of Joining', key: 'doj', type: 'date' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">Edit User: {user.name}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {user.imported && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded text-sm">
              This user was imported and is locked. Saving will unlock the record and prompt a password reset.
            </div>
          )}
          {fields.map(({ label, key, type }) => (
            <label key={key} className="block">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <input type={type || 'text'} value={form[key]} onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                className="mt-1 block w-full px-3 py-2 border rounded text-sm" />
            </label>
          ))}
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Faculty Type</span>
            <select value={form.faculty_type_id} onChange={(e) => setForm(prev => ({ ...prev, faculty_type_id: e.target.value }))}
              className="mt-1 block w-full px-3 py-2 border rounded text-sm">
              <option value="">Select...</option>
              {facultyTypes.map((ft: any) => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Gender</span>
            <select value={form.gender} onChange={(e) => setForm(prev => ({ ...prev, gender: e.target.value }))}
              className="mt-1 block w-full px-3 py-2 border rounded text-sm">
              <option value="">Select...</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Role</span>
            <input type="text" value={form.role} disabled
              className="mt-1 block w-full px-3 py-2 border rounded text-sm bg-gray-100" />
          </label>
        </div>
        <div className="flex gap-2 p-5 border-t bg-gray-50">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
