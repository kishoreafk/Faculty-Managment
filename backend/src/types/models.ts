export interface Faculty {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  password_hash: string;
  role_id: number;
  faculty_type_id: number;
  department: string | null;
  designation: string | null;
  doj: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  experience_years: number;
  qualification: string | null;
  profile_image: string | null;
  approved: boolean;
  active: boolean;
  deleted: boolean;
  deleted_at: string | null;
  created_by_admin: number | null;
  force_password_reset: boolean;
  imported: boolean;
  last_login: string | null;
  created_at: string;
  updated_at?: string;
}

export interface FacultyJoin extends Faculty {
  role_name: string;
  faculty_type_name: string;
}

export interface Role {
  id: number;
  name: string;
  permissions: any;
  created_at: string;
}

export interface FacultyType {
  id: number;
  name: string;
  category: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface LeaveType {
  id: number;
  name: string;
  code: string;
  description: string | null;
  max_balance: number | null;
  accrual_rate: number | null;
  accrual_period: string;
  carry_forward: boolean;
  probation_excluded: boolean;
  min_service_months: number;
  gender_restriction: string;
  active: boolean;
  created_at: string;
}

export interface LeaveRule {
  id: number;
  faculty_type_id: number;
  leave_type_id: number;
  accrual_rate: number;
  accrual_period: string;
  max_balance: number | null;
  carry_forward: boolean;
  probation_excluded: boolean;
  min_service_months: number;
  progressive_json: any;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
}

export interface LeaveBalance {
  id: number;
  faculty_id: number;
  leave_type_id: number;
  year: number;
  balance: number;
  reserved: number;
  created_at?: string;
  updated_at?: string;
}

export interface LeaveApplication {
  id: number;
  faculty_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  leave_category: string;
  is_during_exam: boolean;
  contact_during_leave: string | null;
  remarks: string | null;
  attachments: any;
  status: string;
  reviewer_id: number | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductRequest {
  id: number;
  faculty_id: number;
  item_name: string;
  quantity: number;
  reason: string;
  status: string;
  admin_id: number | null;
  admin_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface AdminLog {
  id: number;
  admin_id: number;
  action_type: string;
  resource_type: string;
  resource_id: string | null;
  payload: any;
  before_state: any;
  after_state: any;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface VaultifyFile {
  id: number;
  faculty_id: number;
  original_name: string;
  stored_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  category: string | null;
  visibility: string;
  department: string | null;
  created_at: string;
}

export interface TimetableFile {
  id: number;
  faculty_id: number;
  original_name: string;
  stored_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  semester: string | null;
  academic_year: string | null;
  created_at: string;
}

export interface TimetableEntry {
  id: number;
  faculty_id: number;
  subject_code: string;
  subject_name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string | null;
  class_section: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveDiagnostic {
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
