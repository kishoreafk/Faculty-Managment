export interface User {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  role_name: string;
  faculty_type_name?: string;
  faculty_type_id?: number;
  department: string | null;
  designation: string | null;
  doj: string | null;
  gender: string | null;
  experience_years: number;
  qualification: string | null;
  approved: boolean;
  active: boolean;
  deleted: boolean;
  imported: boolean;
  force_password_reset: boolean;
  pending_leave_count?: number;
  pending_product_count?: number;
  created_at: string;
  last_login: string | null;
}

export interface UserDetail extends User {
  leave_balances?: LeaveBalance[];
  leave_diagnostics?: LeaveDiagnosticItem[];
  pending_leave?: any[];
  pending_products?: any[];
}

export interface LeaveBalance {
  id: number;
  faculty_id: number;
  leave_type_id: number;
  year: number;
  balance: number;
  reserved: number;
  name?: string;
  code?: string;
  description?: string;
  available?: number;
  accrual_rate?: number;
  accrual_period?: string;
  max_balance?: number;
}

export interface LeaveApplication {
  id: number;
  faculty_id: number;
  leave_type_id: number;
  leave_type: string;
  leave_code: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: string;
  reviewer_name?: string;
  created_at: string;
  adjustments?: any[];
}

export interface LeaveDiagnosticItem {
  leave_type_id: number;
  leave_type_code: string;
  leave_type_name: string;
  status: string;
  reason: string;
  rule_present: boolean;
  accrual_rate?: number;
  accrual_period?: string;
  max_balance?: number | null;
  balance: number;
  reserved: number;
}

export interface ProductRequest {
  id: number;
  faculty_id: number;
  faculty_name?: string;
  item_name: string;
  quantity: number;
  reason: string;
  status: string;
  admin_name?: string;
  admin_reason?: string;
  created_at: string;
  reviewed_at?: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface ImportResult {
  message: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  leaveWarningCount?: number;
  defaultPassword: string;
  insertedUsers: ImportedUser[];
  leaveWarnings?: ImportWarning[];
  errors: ImportError[];
}

export interface ImportedUser {
  id: number;
  employee_id: string;
  email: string;
  name: string;
  leave_diagnostic?: {
    status: string;
    message: string;
    rules_total: number;
    rules_matched: number;
    balances_inserted: number;
    skipped_zero: number;
  };
}

export interface ImportWarning {
  row: number;
  employee_id: string;
  email: string;
  warning: string;
}

export interface ImportError {
  row: number;
  email?: string;
  reason: string;
}
