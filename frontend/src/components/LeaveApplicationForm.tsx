import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import api from '../utils/api';

interface LeaveFormProps {
  onSuccess: () => void;
  userProfile: any;
}

export default function LeaveApplicationForm({ onSuccess, userProfile }: LeaveFormProps) {
  const { register, handleSubmit, watch, setValue, reset } = useForm();
  const [balances, setBalances] = useState<any[]>([]);
  const [alternateFaculty, setAlternateFaculty] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const startDate = watch('start_date');
  const endDate = watch('end_date');
  const selectedLeaveType = watch('leave_type_id');

  const isTeachingFaculty = userProfile?.faculty_category === 'Teaching';

  useEffect(() => {
    loadBalances();
    if (isTeachingFaculty) {
      loadAlternateFaculty();
    }
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      setValue('total_days', days > 0 ? days : 0);
    }
  }, [startDate, endDate]);

  const loadBalances = async () => {
    try {
      const res = await api.get('/leave/balance');
      setBalances(res.data);
    } catch (err) {
      console.error('Failed to load balances', err);
    }
  };

  const loadAlternateFaculty = async () => {
    try {
      const res = await api.get('/leave/alternate-faculty', {
        params: { department: userProfile?.department }
      });
      setAlternateFaculty(res.data);
    } catch (err) {
      console.error('Failed to load alternate faculty', err);
    }
  };

  const addAdjustment = () => {
    setAdjustments([...adjustments, {
      date: '',
      period: '',
      subject: '',
      class_section: '',
      room_no: '',
      alternate_faculty_id: '',
      remarks: ''
    }]);
  };

  const removeAdjustment = (index: number) => {
    setAdjustments(adjustments.filter((_, i) => i !== index));
  };

  const updateAdjustment = (index: number, field: string, value: any) => {
    const updated = [...adjustments];
    updated[index] = { ...updated[index], [field]: value };
    setAdjustments(updated);
  };

  const onSubmit = async (data: any) => {
    try {
      setLoading(true);
      
      if (isTeachingFaculty && adjustments.length === 0) {
        alert('Teaching faculty must provide alternate arrangements');
        return;
      }

      const payload = {
        ...data,
        adjustments: isTeachingFaculty ? adjustments : []
      };

      await api.post('/leave/apply', payload);
      alert('Leave application submitted successfully');
      reset();
      setAdjustments([]);
      onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to apply leave');
    } finally {
      setLoading(false);
    }
  };

  const selectedBalance = balances.find(b => b.leave_type_id == selectedLeaveType);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Faculty Info - Auto-filled */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-3">Faculty Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-600">Name:</span> <span className="font-medium">{userProfile?.name}</span></div>
          <div><span className="text-gray-600">Employee ID:</span> <span className="font-medium">{userProfile?.employee_id}</span></div>
          <div><span className="text-gray-600">Department:</span> <span className="font-medium">{userProfile?.department}</span></div>
          <div><span className="text-gray-600">Designation:</span> <span className="font-medium">{userProfile?.designation}</span></div>
        </div>
      </div>

      {/* Leave Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Leave Type *</label>
          <select {...register('leave_type_id')} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required>
            <option value="">Select Leave Type</option>
            {balances.map((b: any) => (
              <option key={b.leave_type_id} value={b.leave_type_id}>
                {b.name} (Available: {b.available?.toFixed(1)} days)
              </option>
            ))}
          </select>
          {selectedBalance && (
            <p className="text-xs text-gray-500 mt-1">
              Balance: {selectedBalance.balance?.toFixed(1)} | Reserved: {selectedBalance.reserved?.toFixed(1)}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Leave Category</label>
          <select {...register('leave_category')} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="FULL_DAY">Full Day</option>
            <option value="HALF_DAY">Half Day</option>
            <option value="HOURLY">Hourly</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Start Date *</label>
          <input {...register('start_date')} type="date" min={new Date().toISOString().split('T')[0]} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">End Date *</label>
          <input {...register('end_date')} type="date" min={startDate || new Date().toISOString().split('T')[0]} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Total Days *</label>
          <input {...register('total_days')} type="number" step="0.5" className="w-full px-4 py-2 border rounded-lg bg-gray-50" readOnly />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Contact During Leave</label>
          <input {...register('contact_during_leave')} type="text" placeholder="Phone/Email" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Reason for Leave *</label>
        <textarea {...register('reason')} rows={3} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Provide detailed justification" required />
      </div>

      <div className="flex items-center">
        <input {...register('is_during_exam')} type="checkbox" className="mr-2" />
        <label className="text-sm">Leave overlaps with exam duty or academic event</label>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Additional Remarks</label>
        <textarea {...register('remarks')} rows={2} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Optional notes" />
      </div>

      {/* Alternate Faculty Assignment - Teaching Staff Only */}
      {isTeachingFaculty && (
        <div className="border-t pt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">Alternate Faculty Assignment *</h3>
            <button type="button" onClick={addAdjustment} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
              + Add Adjustment
            </button>
          </div>

          {adjustments.length === 0 && (
            <p className="text-sm text-gray-500 italic">No adjustments added. Click "Add Adjustment" to assign alternate faculty for your classes.</p>
          )}

          {adjustments.map((adj, index) => (
            <div key={index} className="bg-gray-50 p-4 rounded-lg mb-4 relative">
              <button type="button" onClick={() => removeAdjustment(index)} className="absolute top-2 right-2 text-red-600 hover:text-red-800 font-bold">
                ✕
              </button>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date *</label>
                  <input type="date" value={adj.date} onChange={(e) => updateAdjustment(index, 'date', e.target.value)} min={startDate} max={endDate} className="w-full px-3 py-2 border rounded-lg" required />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Period/Time *</label>
                  <input type="text" value={adj.period} onChange={(e) => updateAdjustment(index, 'period', e.target.value)} placeholder="e.g., 10:00-11:00" className="w-full px-3 py-2 border rounded-lg" required />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Subject Code *</label>
                  <input type="text" value={adj.subject} onChange={(e) => updateAdjustment(index, 'subject', e.target.value)} placeholder="e.g., CS-301" className="w-full px-3 py-2 border rounded-lg" required />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Class/Section *</label>
                  <input type="text" value={adj.class_section} onChange={(e) => updateAdjustment(index, 'class_section', e.target.value)} placeholder="e.g., CSE - III Year A" className="w-full px-3 py-2 border rounded-lg" required />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Room No.</label>
                  <input type="text" value={adj.room_no} onChange={(e) => updateAdjustment(index, 'room_no', e.target.value)} placeholder="e.g., Lab-201" className="w-full px-3 py-2 border rounded-lg" />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Alternate Faculty *</label>
                  <select value={adj.alternate_faculty_id} onChange={(e) => updateAdjustment(index, 'alternate_faculty_id', e.target.value)} className="w-full px-3 py-2 border rounded-lg" required>
                    <option value="">Select Faculty</option>
                    {alternateFaculty.map((f: any) => (
                      <option key={f.id} value={f.id}>{f.name} ({f.designation})</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium mb-1">Remarks</label>
                  <input type="text" value={adj.remarks} onChange={(e) => updateAdjustment(index, 'remarks', e.target.value)} placeholder="Additional notes" className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Acknowledgement */}
      <div className="flex items-start">
        <input type="checkbox" className="mt-1 mr-2" required />
        <label className="text-sm">I confirm that all information provided is correct and accurate. *</label>
      </div>

      <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:bg-gray-400">
        {loading ? 'Submitting...' : 'Submit Leave Application'}
      </button>
    </form>
  );
}
