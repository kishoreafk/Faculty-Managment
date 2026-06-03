import { Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { LeaveDiagnosticItem } from '../../types/models';

interface Props {
  diagnostics: LeaveDiagnosticItem[];
  loading: boolean;
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'OK': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'NO_RULE': case 'NO_RULES_DEFINED': return <XCircle className="w-4 h-4 text-red-500" />;
    case 'GENDER_RESTRICTED': case 'PROBATION_EXCLUDED': case 'MIN_SERVICE_NOT_MET': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    default: return <Info className="w-4 h-4 text-gray-400" />;
  }
};

const statusClass = (status: string) => {
  switch (status) {
    case 'OK': return 'bg-emerald-50 text-emerald-800';
    case 'NO_RULE': case 'NO_RULES_DEFINED': return 'bg-red-50 text-red-800';
    case 'GENDER_RESTRICTED': case 'PROBATION_EXCLUDED': case 'MIN_SERVICE_NOT_MET': return 'bg-amber-50 text-amber-800';
    default: return 'bg-gray-50 text-gray-600';
  }
};

export default function LeaveDiagnosticsTable({ diagnostics, loading }: Props) {
  if (loading) return <div className="text-sm text-gray-500">Loading diagnostics...</div>;
  if (!diagnostics || diagnostics.length === 0) return <div className="text-sm text-gray-500">No diagnostic data available.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-2 py-1.5 border">Leave Type</th>
            <th className="text-center px-2 py-1.5 border">Status</th>
            <th className="text-left px-2 py-1.5 border">Reason</th>
            <th className="text-center px-2 py-1.5 border">Balance</th>
            <th className="text-center px-2 py-1.5 border">Reserved</th>
            {diagnostics[0]?.accrual_rate !== undefined && <th className="text-center px-2 py-1.5 border">Accrual</th>}
          </tr>
        </thead>
        <tbody>
          {diagnostics.map((d) => (
            <tr key={d.leave_type_id} className={`border-t ${statusClass(d.status)}`}>
              <td className="px-2 py-1.5 border font-medium">{d.leave_type_name} ({d.leave_type_code})</td>
              <td className="px-2 py-1.5 border text-center">
                <span className="inline-flex items-center gap-1" title={d.reason}>
                  {statusIcon(d.status)}
                  {d.status}
                </span>
              </td>
              <td className="px-2 py-1.5 border max-w-[200px] truncate" title={d.reason}>{d.reason}</td>
              <td className="px-2 py-1.5 border text-center font-mono">{d.balance}</td>
              <td className="px-2 py-1.5 border text-center font-mono">{d.reserved}</td>
              {d.accrual_rate !== undefined && <td className="px-2 py-1.5 border text-center">{d.accrual_rate}/{d.accrual_period}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
