export interface ApiResponse<T = any> {
  message?: string;
  error?: string;
  code?: string;
  details?: unknown;
}

export interface PaginatedResponse<T> extends ApiResponse {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface BulkImportResult {
  success: number;
  failed: number;
  errors: { row: number; error: string }[];
  leaveWarnings: { row: number; email: string; warning: string }[];
}

export interface LeaveDiagnosticResponse {
  leave_diagnostics: import('./models').LeaveDiagnostic[];
}

export interface CreateUserRequest {
  employee_id: string;
  name: string;
  email: string;
  password?: string;
  role_id: number;
  faculty_type_id: number;
  department?: string;
  designation?: string;
  doj?: string;
  gender?: string;
  experience_years?: number;
  qualification?: string;
  force_update?: boolean;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  department?: string;
  designation?: string;
  faculty_type_id?: number;
  doj?: string;
  gender?: string;
  experience_years?: number;
  qualification?: string;
  active?: boolean;
  role_id?: number;
  force_update?: boolean;
}

export interface ApplyLeaveRequest {
  leave_type_id: number;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  leave_category?: string;
  is_during_exam?: boolean;
  contact_during_leave?: string;
  remarks?: string;
  attachments?: any;
  adjustments?: any[];
}

export interface ProductRequestInput {
  item_name: string;
  quantity: number;
  reason: string;
}
