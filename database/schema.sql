-- DB name is set by docker-compose / environment variable DB_NAME.
-- The `mysql` CLI invoked by the migration service specifies the DB,
-- so this schema file is agnostic. When running manually, source it as:
--   mysql -u root -p ${DB_NAME:-faculty_management} < schema.sql
-- ============================================
-- FACULTY MANAGEMENT SYSTEM - COMPLETE SCHEMA
-- ============================================

-- (DROP TABLE section removed — schema is idempotent)

-- ============================================
-- ROLES & PERMISSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name ENUM('FACULTY','ADMIN','HOD','SUPER_ADMIN') NOT NULL UNIQUE,
  permissions JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO roles (name, permissions) VALUES
('SUPER_ADMIN', '["all"]'),
('ADMIN', '["manage_users","approve_leave","approve_products","view_all"]'),
('HOD', '["approve_leave", "view_department", "manage_timetable"]'),
('FACULTY', '["apply_leave", "view_own", "upload_documents"]');

-- Ensure FACULTY role is id=4 for new registrations
-- If roles are already created, this comment serves as documentation

-- ============================================
-- FACULTY TYPES & FACULTY
-- ============================================
CREATE TABLE IF NOT EXISTS faculty_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  category ENUM('Teaching','NonTeaching','Contract','Visiting') NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO faculty_types (name, category, description) VALUES
('Assistant Professor', 'Teaching', 'Regular teaching faculty'),
('Associate Professor', 'Teaching', 'Senior teaching faculty'),
('Professor', 'Teaching', 'Senior-most teaching faculty'),
('Lab Assistant', 'NonTeaching', 'Laboratory support staff'),
('Visiting Faculty', 'Visiting', 'Part-time visiting faculty'),
('Contract Faculty', 'Contract', 'Contract-based faculty');

CREATE TABLE IF NOT EXISTS faculty (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  faculty_type_id INT NOT NULL,
  department VARCHAR(100),
  designation VARCHAR(100),
  doj DATE,
  gender ENUM('MALE','FEMALE','OTHER') DEFAULT NULL,
  experience_years INT DEFAULT 0,
  qualification VARCHAR(255),
  profile_image VARCHAR(255),
  approved BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  created_by_admin INT NULL,
  force_password_reset BOOLEAN DEFAULT FALSE,
  imported BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (faculty_type_id) REFERENCES faculty_types(id),
  FOREIGN KEY (created_by_admin) REFERENCES faculty(id) ON DELETE SET NULL,
  INDEX idx_email (email),
  INDEX idx_employee_id (employee_id),
  INDEX idx_department (department),
  INDEX idx_deleted (deleted),
  INDEX idx_role (role_id),
  INDEX idx_faculty_type (faculty_type_id),
  INDEX idx_active_approved (active, approved)
);

CREATE TABLE IF NOT EXISTS faculty_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  field_changed VARCHAR(50),
  old_value TEXT,
  new_value TEXT,
  changed_by INT,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  INDEX idx_faculty_id (faculty_id)
);

CREATE TABLE IF NOT EXISTS faculty_activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  action VARCHAR(100),
  module VARCHAR(50),
  details JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  INDEX idx_faculty_action (faculty_id, action)
);

-- ============================================
-- AUTHENTICATION
-- ============================================
CREATE TABLE IF NOT EXISTS auth_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  refresh_token VARCHAR(512) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  jti VARCHAR(64) NOT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP NULL,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_token_hash (token_hash),
  INDEX idx_token (refresh_token(255)),
  INDEX idx_jti (jti),
  INDEX idx_faculty_revoked (faculty_id, revoked)
);

CREATE TABLE IF NOT EXISTS auth_token_revocations (
  jti VARCHAR(64) NOT NULL,
  faculty_id INT NOT NULL,
  reason VARCHAR(100) NOT NULL DEFAULT 'LOGOUT',
  revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  PRIMARY KEY (jti),
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  INDEX idx_faculty (faculty_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_token_hash (token_hash),
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  INDEX idx_faculty (faculty_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- DYNAMIC FORM ENGINE
-- ============================================
CREATE TABLE IF NOT EXISTS form_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category ENUM('LEAVE','COURSE','PRODUCT','PROFILE','RESEARCH','PERFORMANCE') NOT NULL,
  faculty_type_id INT NULL,
  version INT DEFAULT 1,
  active BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (faculty_type_id) REFERENCES faculty_types(id),
  INDEX idx_category (category, active),
  INDEX idx_faculty_type_id (faculty_type_id)
);

CREATE TABLE IF NOT EXISTS form_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  label VARCHAR(100) NOT NULL,
  type ENUM('text','number','textarea','select','date','checkbox','file','signature') NOT NULL,
  required BOOLEAN DEFAULT FALSE,
  order_index INT DEFAULT 0,
  options_json JSON,
  validation_json JSON,
  autofill_key VARCHAR(100),
  visible_if JSON,
  default_value VARCHAR(255),
  FOREIGN KEY (form_id) REFERENCES form_definitions(id) ON DELETE CASCADE,
  INDEX idx_form_order (form_id, order_index)
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id INT NOT NULL,
  faculty_id INT NOT NULL,
  category ENUM('LEAVE','PRODUCT','COURSE','VAULTIFY','RESEARCH','PERFORMANCE') NOT NULL,
  payload JSON NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','IN_PROGRESS') DEFAULT 'PENDING',
  reviewer_id INT,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (form_id) REFERENCES form_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES faculty(id) ON DELETE SET NULL,
  INDEX idx_faculty_status (faculty_id, status),
  INDEX idx_category (category, status),
  INDEX idx_form_id (form_id),
  INDEX idx_reviewer_id (reviewer_id)
);

-- ============================================
-- LEAVE MANAGEMENT SYSTEM
-- ============================================
CREATE TABLE IF NOT EXISTS leave_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,
  description TEXT,
  max_balance FLOAT DEFAULT NULL,
  accrual_rate FLOAT DEFAULT NULL,
  accrual_period ENUM('DAILY','MONTHLY','YEARLY','ONE_TIME') DEFAULT 'MONTHLY',
  carry_forward BOOLEAN DEFAULT TRUE,
  probation_excluded BOOLEAN DEFAULT FALSE,
  min_service_months INT DEFAULT 0,
  gender_restriction ENUM('ALL','MALE','FEMALE') DEFAULT 'ALL',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO leave_types (name, code, description, accrual_rate, accrual_period, max_balance, carry_forward, probation_excluded, min_service_months, gender_restriction) VALUES
('Casual Leave', 'CL', 'Short-term casual leave', 1.0, 'MONTHLY', 12, FALSE, FALSE, 0, 'ALL'),
('Earned Leave', 'EL', 'Earned leave for long service', 2.5, 'MONTHLY', 300, TRUE, FALSE, 0, 'ALL'),
('Medical Leave', 'ML', 'Medical emergency leave', 1.66, 'MONTHLY', 20, TRUE, FALSE, 0, 'ALL'),
('Maternity Leave', 'MAT', 'Maternity leave for female faculty', 180, 'ONE_TIME', 180, FALSE, FALSE, 12, 'FEMALE'),
('Paternity Leave', 'PAT', 'Paternity leave', 15, 'ONE_TIME', 15, FALSE, FALSE, 6, 'MALE'),
('Academic Leave', 'AL', 'Academic development leave', 1.25, 'MONTHLY', 15, FALSE, TRUE, 6, 'ALL'),
('Restricted Holiday', 'RH', 'Restricted holiday leave', 0.16, 'MONTHLY', 2, FALSE, FALSE, 0, 'ALL'),
('On Duty', 'OD', 'Official duty leave', NULL, 'ONE_TIME', NULL, FALSE, FALSE, 0, 'ALL');

CREATE TABLE IF NOT EXISTS leave_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  faculty_type_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  accrual_rate FLOAT NOT NULL,
  accrual_period ENUM('MONTHLY','YEARLY','DAILY','ONE_TIME') DEFAULT 'MONTHLY',
  max_balance FLOAT,
  carry_forward BOOLEAN DEFAULT TRUE,
  probation_excluded BOOLEAN DEFAULT FALSE,
  min_service_months INT DEFAULT 0,
  progressive_json JSON DEFAULT NULL,
  effective_from DATE DEFAULT NULL,
  effective_to DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (faculty_type_id) REFERENCES faculty_types(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  UNIQUE KEY unique_rule (faculty_type_id, leave_type_id),
  INDEX idx_rule_faculty_type (faculty_type_id),
  INDEX idx_rule_leave_type (leave_type_id)
);

-- =====================================================================
-- LEAVE RULES PER FACULTY TYPE
-- =====================================================================
-- These rules define the leave entitlements for each faculty_type_id.
-- faculty_type_id reference:
--   1 = Assistant Professor (Teaching)
--   2 = Associate Professor (Teaching)
--   3 = Professor (Teaching)
--   4 = Lab Assistant (NonTeaching)
--   5 = Visiting Faculty (Visiting)
--   6 = Contract Faculty (Contract)
--
-- leave_type_id reference (from leave_types above):
--   1 = CL  (Casual Leave)        5 = PAT (Paternity Leave)
--   2 = EL  (Earned Leave)         6 = AL  (Academic Leave)
--   3 = ML  (Medical Leave)        7 = RH  (Restricted Holiday)
--   4 = MAT (Maternity Leave)      8 = OD  (On Duty)
-- =====================================================================

-- Assistant Professor (Teaching)
INSERT IGNORE INTO leave_rules (faculty_type_id, leave_type_id, accrual_rate, accrual_period, max_balance, carry_forward, probation_excluded, min_service_months) VALUES
(1, 1, 1.0, 'MONTHLY', 12, FALSE, FALSE, 0),
(1, 2, 2.5, 'MONTHLY', 300, TRUE, FALSE, 0),
(1, 3, 1.66, 'MONTHLY', 20, TRUE, FALSE, 0),
(1, 6, 1.25, 'MONTHLY', 15, FALSE, TRUE, 6),
(1, 7, 0.16, 'MONTHLY', 2, FALSE, FALSE, 0);

-- Associate Professor (Teaching)
INSERT IGNORE INTO leave_rules (faculty_type_id, leave_type_id, accrual_rate, accrual_period, max_balance, carry_forward, probation_excluded, min_service_months) VALUES
(2, 1, 1.0, 'MONTHLY', 12, FALSE, FALSE, 0),
(2, 2, 2.0, 'MONTHLY', 240, TRUE, FALSE, 0),
(2, 3, 1.66, 'MONTHLY', 20, TRUE, FALSE, 0),
(2, 6, 1.25, 'MONTHLY', 15, FALSE, TRUE, 6),
(2, 7, 0.16, 'MONTHLY', 2, FALSE, FALSE, 0);

-- Professor (Teaching) - senior-most teaching faculty
INSERT IGNORE INTO leave_rules (faculty_type_id, leave_type_id, accrual_rate, accrual_period, max_balance, carry_forward, probation_excluded, min_service_months) VALUES
(3, 1, 1.0, 'MONTHLY', 12, FALSE, FALSE, 0),
(3, 2, 2.0, 'MONTHLY', 300, TRUE, FALSE, 0),
(3, 3, 1.66, 'MONTHLY', 20, TRUE, FALSE, 0),
(3, 6, 1.25, 'MONTHLY', 15, FALSE, TRUE, 6),
(3, 7, 0.16, 'MONTHLY', 2, FALSE, FALSE, 0);

-- Lab Assistant (NonTeaching) - support staff, limited leave
INSERT IGNORE INTO leave_rules (faculty_type_id, leave_type_id, accrual_rate, accrual_period, max_balance, carry_forward, probation_excluded, min_service_months) VALUES
(4, 1, 1.0, 'MONTHLY', 12, FALSE, FALSE, 0),
(4, 2, 1.5, 'MONTHLY', 180, TRUE, FALSE, 0),
(4, 3, 1.0, 'MONTHLY', 12, TRUE, FALSE, 0),
(4, 7, 0.16, 'MONTHLY', 2, FALSE, FALSE, 0);

-- Visiting Faculty (Visiting) - part-time, minimal leave entitlements
INSERT IGNORE INTO leave_rules (faculty_type_id, leave_type_id, accrual_rate, accrual_period, max_balance, carry_forward, probation_excluded, min_service_months) VALUES
(5, 1, 0.5, 'MONTHLY', 6, FALSE, FALSE, 0),
(5, 7, 0.16, 'MONTHLY', 2, FALSE, FALSE, 0);

-- Contract Faculty (Contract) - contract-based
INSERT IGNORE INTO leave_rules (faculty_type_id, leave_type_id, accrual_rate, accrual_period, max_balance, carry_forward, probation_excluded, min_service_months) VALUES
(6, 1, 1.0, 'MONTHLY', 12, FALSE, FALSE, 0),
(6, 2, 1.5, 'MONTHLY', 180, TRUE, FALSE, 0),
(6, 3, 1.0, 'MONTHLY', 12, TRUE, FALSE, 0),
(6, 7, 0.16, 'MONTHLY', 2, FALSE, FALSE, 0);

CREATE TABLE IF NOT EXISTS leave_balances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  year INT NOT NULL,
  balance FLOAT DEFAULT 0,
  reserved FLOAT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_balance (faculty_id, leave_type_id, year),
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  INDEX idx_faculty_year (faculty_id, year),
  INDEX idx_balance_leave_type (leave_type_id)
);

CREATE TABLE IF NOT EXISTS leave_accrual_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  accrual_date DATE NOT NULL,
  accrual_amount FLOAT NOT NULL,
  total_balance_after FLOAT NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  INDEX idx_faculty_date (faculty_id, accrual_date),
  INDEX idx_accrual_leave_type (leave_type_id)
);

CREATE TABLE IF NOT EXISTS leave_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  form_id INT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days FLOAT NOT NULL,
  leave_category ENUM('FULL_DAY','HALF_DAY','SHORT_LEAVE') DEFAULT 'FULL_DAY',
  reason TEXT NOT NULL,
  is_during_exam BOOLEAN DEFAULT FALSE,
  contact_during_leave VARCHAR(100),
  remarks TEXT,
  attachments JSON,
  payload JSON,
  status ENUM('PENDING','APPROVED','REJECTED','CANCELLED','DELETED') DEFAULT 'PENDING',
  reviewer_id INT,
  review_reason TEXT,
  reviewed_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES form_definitions(id),
  FOREIGN KEY (reviewer_id) REFERENCES faculty(id) ON DELETE SET NULL,
  INDEX idx_faculty_dates (faculty_id, start_date, end_date),
  INDEX idx_status (status),
  INDEX idx_reviewer_status (reviewer_id, status),
  INDEX idx_dates (start_date, end_date),
  INDEX idx_app_leave_type (leave_type_id),
  INDEX idx_app_form_id (form_id)
);

CREATE TABLE IF NOT EXISTS leave_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  leave_application_id INT NOT NULL,
  adjustment_date DATE NOT NULL,
  period VARCHAR(20) NOT NULL,
  subject_code VARCHAR(100) NOT NULL,
  class_section VARCHAR(100) NOT NULL,
  room_no VARCHAR(20),
  alternate_faculty_id INT NOT NULL,
  confirmation_status ENUM('PENDING','CONFIRMED','DECLINED') DEFAULT 'PENDING',
  remarks TEXT,
  confirmed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (leave_application_id) REFERENCES leave_applications(id) ON DELETE CASCADE,
  FOREIGN KEY (alternate_faculty_id) REFERENCES faculty(id),
  INDEX idx_leave_app (leave_application_id),
  INDEX idx_alternate_faculty (alternate_faculty_id, confirmation_status),
  INDEX idx_date (adjustment_date)
);

-- ============================================
-- COURSE & TIMETABLE MANAGEMENT
-- ============================================
CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  department VARCHAR(100),
  semester INT,
  credits INT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dept_sem (department, semester)
);

CREATE TABLE IF NOT EXISTS timetable (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  course_id INT,
  faculty_id INT,
  day_of_week ENUM('MON','TUE','WED','THU','FRI','SAT') NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room_no VARCHAR(50),
  mode ENUM('OFFLINE','ONLINE') DEFAULT 'OFFLINE',
  academic_year VARCHAR(20),
  semester INT,
  created_by INT NOT NULL,
  created_via ENUM('MANUAL','UPLOAD') DEFAULT 'MANUAL',
  upload_path VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES faculty(id) ON DELETE CASCADE,
  INDEX idx_faculty_schedule (faculty_id, day_of_week, start_time),
  INDEX idx_room_schedule (room_no, day_of_week, start_time),
  INDEX idx_timetable_course (course_id),
  INDEX idx_timetable_created_by (created_by)
);

CREATE TABLE IF NOT EXISTS timetable_files (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  uploaded_by INT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  file_size_kb INT NOT NULL,
  mime_type VARCHAR(100),
  title VARCHAR(255) NULL,
  description TEXT NULL,
  year INT NULL,
  semester VARCHAR(50) NULL,
  visibility ENUM('PRIVATE','DEPARTMENT','PUBLIC') DEFAULT 'PRIVATE',
  version INT DEFAULT 1,
  is_active BOOL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES faculty(id),
  INDEX (uploaded_by),
  INDEX (visibility),
  FULLTEXT INDEX ft_title_desc (title, description)
);

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'faculty' AND COLUMN_NAME = 'assigned_timetable_file_id');
SET @sql_alter = IF(@col_exists = 0,
  'ALTER TABLE faculty ADD COLUMN assigned_timetable_file_id BIGINT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql_alter; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'faculty'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME LIKE '%timetable_files%');
SET @sql_fk = IF(@fk_exists = 0,
  'ALTER TABLE faculty ADD FOREIGN KEY (assigned_timetable_file_id) REFERENCES timetable_files(id)',
  'SELECT 1');
PREPARE stmt FROM @sql_fk; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @imported_col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'faculty' AND COLUMN_NAME = 'imported');
SET @sql_imported_col = IF(@imported_col_exists = 0,
  'ALTER TABLE faculty ADD COLUMN imported BOOLEAN DEFAULT FALSE',
  'SELECT 1');
PREPARE stmt FROM @sql_imported_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS timetable_access_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  file_id BIGINT NOT NULL,
  action ENUM('UPLOAD','VIEW','DOWNLOAD','ASSIGN','UNASSIGN','DELETE') NOT NULL,
  performed_by INT NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES timetable_files(id) ON DELETE CASCADE,
  INDEX (performed_by),
  INDEX (file_id)
);

CREATE TABLE IF NOT EXISTS course_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  faculty_id INT NOT NULL,
  syllabus JSON,
  week_wise_plan JSON,
  status ENUM('DRAFT','SUBMITTED','APPROVED') DEFAULT 'DRAFT',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  INDEX idx_faculty_course (faculty_id, course_id),
  INDEX idx_course_plans_course (course_id)
);

-- ============================================
-- VAULTIFY - DOCUMENT MANAGEMENT
-- ============================================
CREATE TABLE IF NOT EXISTS vault_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO vault_categories (name, description) VALUES
('Certificate', 'Academic and professional certificates'),
('Research', 'Research papers and publications'),
('Patent', 'Patent documents'),
('Teaching', 'Teaching materials and resources'),
('Personal', 'Personal documents'),
('Appointment', 'Appointment letters and contracts');

CREATE TABLE IF NOT EXISTS vault_files (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  category_id INT NULL,
  title VARCHAR(255),
  description TEXT,
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_size_kb INT NOT NULL,
  mime_type VARCHAR(100),
  checksum VARCHAR(64),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  visibility ENUM('PRIVATE','DEPARTMENT','PUBLIC','SHARED') DEFAULT 'PRIVATE',
  encrypted BOOL DEFAULT FALSE,
  version INT DEFAULT 1,
  is_latest BOOL DEFAULT TRUE,
  archived BOOL DEFAULT FALSE,
  archived_at TIMESTAMP NULL,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES vault_categories(id) ON DELETE SET NULL,
  INDEX (faculty_id),
  INDEX (visibility),
  INDEX idx_category_id (category_id),
  FULLTEXT INDEX ft_title_description (title, description)
);

CREATE TABLE IF NOT EXISTS vault_file_shares (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  file_id BIGINT NOT NULL,
  token VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES vault_files(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES faculty(id) ON DELETE CASCADE,
  INDEX (token),
  INDEX idx_share_created_by (created_by)
);

CREATE TABLE IF NOT EXISTS vault_access_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  file_id BIGINT NOT NULL,
  action ENUM('UPLOAD','DOWNLOAD','VIEW','DELETE','SHARE') NOT NULL,
  performed_by INT NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES vault_files(id) ON DELETE CASCADE,
  INDEX (file_id),
  INDEX (performed_by)
);

-- ============================================
-- PRODUCT/RESOURCE REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS product_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  reason TEXT,
  status ENUM('PENDING','APPROVED','REJECTED','CANCELLED','DELETED') DEFAULT 'PENDING',
  admin_id INT,
  admin_reason TEXT,
  reviewed_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES faculty(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_faculty (faculty_id),
  INDEX idx_admin_id (admin_id)
);

-- ============================================
-- RESEARCH TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS research_projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  type ENUM('Paper','Journal','Conference','Patent','Book','Chapter') NOT NULL,
  publication_date DATE,
  publisher VARCHAR(255),
  doi VARCHAR(100),
  status ENUM('Published','Under Review','In Progress') DEFAULT 'In Progress',
  file_id BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES vault_files(id) ON DELETE SET NULL,
  INDEX idx_faculty_type (faculty_id, type),
  INDEX idx_research_file (file_id)
);

-- ============================================
-- ANNOUNCEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  department VARCHAR(100),
  priority ENUM('LOW','MEDIUM','HIGH','URGENT') DEFAULT 'MEDIUM',
  created_by INT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES faculty(id) ON DELETE CASCADE,
  INDEX idx_active_priority (active, priority, created_at),
  INDEX idx_dept_active (department, active),
  INDEX idx_announce_created_by (created_by)
);

-- ============================================
-- ADMIN LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS admin_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id BIGINT,
  payload JSON NULL,
  before_state JSON NULL,
  after_state JSON NULL,
  reason TEXT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES faculty(id) ON DELETE CASCADE,
  INDEX idx_admin_action (admin_id, action_type),
  INDEX idx_resource (resource_type, resource_id),
  INDEX idx_created (created_at)
);

-- ============================================
-- STORED PROCEDURES
-- ============================================

DELIMITER //

-- Format TIME to 12-hour format
DROP FUNCTION IF EXISTS fn_format_time_12hr;
CREATE FUNCTION fn_format_time_12hr(time_val TIME)
RETURNS VARCHAR(20)
DETERMINISTIC
BEGIN
  DECLARE hours INT;
  DECLARE minutes INT;
  DECLARE ampm VARCHAR(2);
  DECLARE display_hours INT;
  
  SET hours = HOUR(time_val);
  SET minutes = MINUTE(time_val);
  SET ampm = IF(hours >= 12, 'PM', 'AM');
  SET display_hours = IF(hours % 12 = 0, 12, hours % 12);
  
  RETURN CONCAT(display_hours, ':', LPAD(minutes, 2, '0'), ' ', ampm);
END //

-- Create admin user (promotion or new)
DROP PROCEDURE IF EXISTS sp_create_admin;
CREATE PROCEDURE sp_create_admin(
  IN p_name VARCHAR(100), IN p_email VARCHAR(150), IN p_password_hash VARCHAR(255),
  IN p_employee_id VARCHAR(50), IN p_department VARCHAR(100), IN p_designation VARCHAR(100),
  IN p_faculty_type_id INT, IN p_created_by INT, IN p_role_id INT
)
BEGIN
  INSERT INTO faculty (employee_id, name, email, password_hash, role_id, faculty_type_id, department, designation, doj, approved, created_by_admin)
  VALUES (p_employee_id, p_name, p_email, p_password_hash, p_role_id, p_faculty_type_id, p_department, p_designation, CURDATE(), TRUE, p_created_by);
  
  INSERT INTO admin_logs (admin_id, action_type, resource_type, resource_id, after_state)
  VALUES (p_created_by, 'CREATE_ADMIN', 'faculty', LAST_INSERT_ID(), JSON_OBJECT('email', p_email, 'role_id', p_role_id));
END //

-- Auto-assign default leaves on approval with initial accrual (set-based)
-- Returns a single-row diagnostic result so callers can see
-- why balances may be 0 or missing.
DROP PROCEDURE IF EXISTS sp_assign_default_leaves;
CREATE PROCEDURE sp_assign_default_leaves(IN p_faculty_id INT)
BEGIN
  DECLARE v_faculty_type_id INT;
  DECLARE v_doj DATE;
  DECLARE v_gender VARCHAR(20);
  DECLARE v_faculty_exists INT DEFAULT 0;
  DECLARE v_rules_total INT DEFAULT 0;
  DECLARE v_rules_matched INT DEFAULT 0;
  DECLARE v_balances_inserted INT DEFAULT 0;
  DECLARE v_skipped_zero INT DEFAULT 0;
  
  SELECT COUNT(*) INTO v_faculty_exists FROM faculty WHERE id = p_faculty_id;
  IF v_faculty_exists = 0 THEN
    SELECT 'FACULTY_NOT_FOUND' AS status,
           'No faculty record exists with the supplied id' AS message,
           0 AS rules_total, 0 AS rules_matched, 0 AS balances_inserted;
  ELSE
    SELECT faculty_type_id, COALESCE(doj, CURDATE()), gender
    INTO v_faculty_type_id, v_doj, v_gender
    FROM faculty WHERE id = p_faculty_id;

    INSERT INTO leave_balances (faculty_id, leave_type_id, year, balance)
    SELECT p_faculty_id, lr.leave_type_id, YEAR(CURDATE()),
      LEAST(
        CASE
          WHEN lr.probation_excluded = TRUE AND TIMESTAMPDIFF(MONTH, v_doj, CURDATE()) < 6 THEN 0
          WHEN TIMESTAMPDIFF(MONTH, v_doj, CURDATE()) < COALESCE(lr.min_service_months, 0) THEN 0
          WHEN lr.accrual_period = 'MONTHLY' THEN
            CASE
              WHEN YEAR(v_doj) = YEAR(CURDATE()) AND MONTH(v_doj) = MONTH(CURDATE())
              THEN lr.accrual_rate * GREATEST(DAY(LAST_DAY(v_doj)) - DAY(v_doj) + 1, 0) / GREATEST(DAY(LAST_DAY(v_doj)), 1)
              ELSE lr.accrual_rate * GREATEST(TIMESTAMPDIFF(MONTH, v_doj, CURDATE()) + 1, 0)
            END
          WHEN lr.accrual_period = 'YEARLY' THEN
            CASE
              WHEN YEAR(v_doj) = YEAR(CURDATE())
              THEN lr.accrual_rate * GREATEST(12 - MONTH(v_doj) + 1, 0) / 12
              ELSE lr.accrual_rate * GREATEST(YEAR(CURDATE()) - YEAR(v_doj) + 1, 0)
            END
          WHEN lr.accrual_period = 'ONE_TIME' THEN
            COALESCE(LEAST(lr.accrual_rate, lr.max_balance), lr.accrual_rate, lr.max_balance, 0)
          WHEN lr.accrual_period = 'DAILY' THEN
            lr.accrual_rate * GREATEST(DATEDIFF(CURDATE(), v_doj), 0)
          ELSE 0
        END,
        COALESCE(lr.max_balance, CASE
          WHEN lr.accrual_period = 'MONTHLY' THEN
            CASE
              WHEN YEAR(v_doj) = YEAR(CURDATE()) AND MONTH(v_doj) = MONTH(CURDATE())
              THEN lr.accrual_rate * GREATEST(DAY(LAST_DAY(v_doj)) - DAY(v_doj) + 1, 0) / GREATEST(DAY(LAST_DAY(v_doj)), 1)
              ELSE lr.accrual_rate * GREATEST(TIMESTAMPDIFF(MONTH, v_doj, CURDATE()) + 1, 0)
            END
          WHEN lr.accrual_period = 'YEARLY' THEN
            CASE
              WHEN YEAR(v_doj) = YEAR(CURDATE())
              THEN lr.accrual_rate * GREATEST(12 - MONTH(v_doj) + 1, 0) / 12
              ELSE lr.accrual_rate * GREATEST(YEAR(CURDATE()) - YEAR(v_doj) + 1, 0)
            END
          ELSE lr.accrual_rate
        END)
      )
    FROM leave_rules lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.faculty_type_id = v_faculty_type_id
      AND (lt.gender_restriction = 'ALL' OR lt.gender_restriction = v_gender OR v_gender IS NULL)
    ON DUPLICATE KEY UPDATE balance = VALUES(balance);

    SELECT COUNT(*) INTO v_rules_total
    FROM leave_rules lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.faculty_type_id = v_faculty_type_id
      AND (lt.gender_restriction = 'ALL' OR lt.gender_restriction = v_gender OR v_gender IS NULL);

    SELECT COUNT(*) INTO v_balances_inserted
    FROM leave_balances WHERE faculty_id = p_faculty_id AND year = YEAR(CURDATE());

    INSERT INTO leave_accrual_history (faculty_id, leave_type_id, accrual_date, accrual_amount, total_balance_after, note)
    SELECT p_faculty_id, lr.leave_type_id, CURDATE(),
      COALESCE((SELECT balance FROM leave_balances lb
                WHERE lb.faculty_id = p_faculty_id AND lb.leave_type_id = lr.leave_type_id AND lb.year = YEAR(CURDATE())), 0),
      COALESCE((SELECT balance FROM leave_balances lb
                WHERE lb.faculty_id = p_faculty_id AND lb.leave_type_id = lr.leave_type_id AND lb.year = YEAR(CURDATE())), 0),
      CASE
        WHEN lr.probation_excluded = TRUE AND TIMESTAMPDIFF(MONTH, v_doj, CURDATE()) < 6
        THEN CONCAT('Skipped during probation (service months: ', TIMESTAMPDIFF(MONTH, v_doj, CURDATE()), ' < 6)')
        WHEN TIMESTAMPDIFF(MONTH, v_doj, CURDATE()) < COALESCE(lr.min_service_months, 0)
        THEN CONCAT('Min service not met (', TIMESTAMPDIFF(MONTH, v_doj, CURDATE()), ' < ', lr.min_service_months, ')')
        ELSE 'Initial accrual on approval'
      END
    FROM leave_rules lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.faculty_type_id = v_faculty_type_id
      AND (lt.gender_restriction = 'ALL' OR lt.gender_restriction = v_gender OR v_gender IS NULL);

    SELECT COUNT(*) INTO v_rules_matched
    FROM leave_balances WHERE faculty_id = p_faculty_id AND year = YEAR(CURDATE()) AND balance > 0;

    SELECT COUNT(*) INTO v_skipped_zero
    FROM leave_balances WHERE faculty_id = p_faculty_id AND year = YEAR(CURDATE()) AND balance = 0;

    IF v_rules_total = 0 THEN
      SELECT 'NO_RULES_DEFINED' AS status,
             CONCAT('No leave rules are defined for faculty_type_id=', v_faculty_type_id, '.') AS message,
             v_rules_total AS rules_total, v_rules_matched AS rules_matched,
             v_balances_inserted AS balances_inserted, v_skipped_zero AS skipped_zero;
    ELSE
      SELECT 'OK' AS status,
             CONCAT('Leave balances assigned for ', v_balances_inserted, ' rule(s).') AS message,
             v_rules_total AS rules_total, v_rules_matched AS rules_matched,
             v_balances_inserted AS balances_inserted, v_skipped_zero AS skipped_zero;
    END IF;
  END IF;
END //

-- Monthly Leave Accrual with Pro-rated DOJ and Probation Check (set-based)
DROP PROCEDURE IF EXISTS sp_monthly_leave_accrual;
CREATE PROCEDURE sp_monthly_leave_accrual()
BEGIN
  INSERT INTO leave_balances (faculty_id, leave_type_id, year, balance)
  SELECT f.id, lr.leave_type_id, YEAR(CURDATE()),
    CASE
      WHEN YEAR(COALESCE(f.doj, CURDATE())) = YEAR(CURDATE())
       AND MONTH(COALESCE(f.doj, CURDATE())) = MONTH(CURDATE())
      THEN lr.accrual_rate * GREATEST(DAY(LAST_DAY(CURDATE())) - DAY(COALESCE(f.doj, CURDATE())) + 1, 0)
           / GREATEST(DAY(LAST_DAY(CURDATE())), 1)
      ELSE lr.accrual_rate
    END
  FROM faculty f
  JOIN leave_rules lr ON f.faculty_type_id = lr.faculty_type_id
  WHERE f.active = TRUE AND f.approved = TRUE
    AND lr.accrual_period = 'MONTHLY'
    AND NOT (lr.probation_excluded = TRUE AND TIMESTAMPDIFF(MONTH, COALESCE(f.doj, CURDATE()), CURDATE()) < 6)
    AND TIMESTAMPDIFF(MONTH, COALESCE(f.doj, CURDATE()), CURDATE()) >= COALESCE(lr.min_service_months, 0)
  ON DUPLICATE KEY UPDATE balance = LEAST(
    COALESCE(balance, 0) + VALUES(balance),
    COALESCE(
      (SELECT lr2.max_balance FROM leave_rules lr2
       JOIN faculty f2 ON f2.faculty_type_id = lr2.faculty_type_id
       WHERE f2.id = VALUES(faculty_id) AND lr2.leave_type_id = VALUES(leave_type_id)
         AND lr2.accrual_period = 'MONTHLY'
       LIMIT 1),
      999999
    )
  );

  INSERT INTO leave_accrual_history (faculty_id, leave_type_id, accrual_date, accrual_amount, total_balance_after, note)
  SELECT f.id, lr.leave_type_id, CURDATE(),
    CASE
      WHEN YEAR(COALESCE(f.doj, CURDATE())) = YEAR(CURDATE())
       AND MONTH(COALESCE(f.doj, CURDATE())) = MONTH(CURDATE())
      THEN lr.accrual_rate * GREATEST(DAY(LAST_DAY(CURDATE())) - DAY(COALESCE(f.doj, CURDATE())) + 1, 0)
           / GREATEST(DAY(LAST_DAY(CURDATE())), 1)
      ELSE lr.accrual_rate
    END,
    COALESCE((SELECT balance FROM leave_balances lb
              WHERE lb.faculty_id = f.id AND lb.leave_type_id = lr.leave_type_id AND lb.year = YEAR(CURDATE())), 0),
    'Monthly accrual'
  FROM faculty f
  JOIN leave_rules lr ON f.faculty_type_id = lr.faculty_type_id
  WHERE f.active = TRUE AND f.approved = TRUE
    AND lr.accrual_period = 'MONTHLY'
    AND NOT (lr.probation_excluded = TRUE AND TIMESTAMPDIFF(MONTH, COALESCE(f.doj, CURDATE()), CURDATE()) < 6)
    AND TIMESTAMPDIFF(MONTH, COALESCE(f.doj, CURDATE()), CURDATE()) >= COALESCE(lr.min_service_months, 0);
END //

-- Apply Leave with Balance, Eligibility and Gender Check
DROP PROCEDURE IF EXISTS sp_apply_leave;
CREATE PROCEDURE sp_apply_leave(
  IN p_faculty_id INT,
  IN p_leave_type_id INT,
  IN p_start_date DATE,
  IN p_end_date DATE,
  IN p_total_days FLOAT,
  IN p_reason TEXT,
  IN p_leave_category VARCHAR(20),
  IN p_is_during_exam BOOLEAN,
  IN p_contact VARCHAR(100),
  IN p_remarks TEXT,
  IN p_attachments JSON,
  OUT p_leave_id INT,
  OUT p_result VARCHAR(255)
)
BEGIN
  DECLARE v_balance FLOAT;
  DECLARE v_reserved FLOAT;
  DECLARE v_doj DATE;
  DECLARE v_service_months INT;
  DECLARE v_min_service INT;
  DECLARE v_probation_excluded BOOLEAN;
  DECLARE v_faculty_type_id INT;
  DECLARE v_gender ENUM('MALE','FEMALE','OTHER');
  DECLARE v_gender_restriction ENUM('ALL','MALE','FEMALE');
  DECLARE v_overlap_count INT;
  
  SELECT doj, faculty_type_id, gender INTO v_doj, v_faculty_type_id, v_gender FROM faculty WHERE id = p_faculty_id;
  SET v_service_months = TIMESTAMPDIFF(MONTH, v_doj, CURDATE());
  
  SELECT lt.gender_restriction INTO v_gender_restriction FROM leave_types lt WHERE lt.id = p_leave_type_id;
  
  IF v_gender_restriction != 'ALL' AND v_gender_restriction != v_gender THEN
    SET p_result = 'GENDER_NOT_ELIGIBLE';
    SET p_leave_id = NULL;
  ELSE
    SELECT lr.min_service_months, lr.probation_excluded INTO v_min_service, v_probation_excluded
    FROM leave_rules lr
    WHERE lr.faculty_type_id = v_faculty_type_id AND lr.leave_type_id = p_leave_type_id;
    
    IF v_probation_excluded = TRUE AND v_service_months < 6 THEN
      SET p_result = 'PROBATION_PERIOD';
      SET p_leave_id = NULL;
    ELSEIF v_service_months < v_min_service THEN
      SET p_result = 'MIN_SERVICE_NOT_MET';
      SET p_leave_id = NULL;
    ELSE
      SELECT COUNT(*) INTO v_overlap_count
      FROM leave_applications
      WHERE faculty_id = p_faculty_id
        AND status IN ('PENDING', 'APPROVED')
        AND (
          (p_start_date BETWEEN start_date AND end_date) OR
          (p_end_date BETWEEN start_date AND end_date) OR
          (start_date BETWEEN p_start_date AND p_end_date)
        );
      
      IF v_overlap_count > 0 THEN
        SET p_result = 'OVERLAPPING_LEAVE';
        SET p_leave_id = NULL;
      ELSE
        SELECT balance, reserved INTO v_balance, v_reserved
        FROM leave_balances
        WHERE faculty_id = p_faculty_id 
          AND leave_type_id = p_leave_type_id 
          AND year = YEAR(CURDATE());
        
        IF (v_balance - v_reserved) >= p_total_days THEN
          INSERT INTO leave_applications (faculty_id, leave_type_id, start_date, end_date, total_days, reason, leave_category, is_during_exam, contact_during_leave, remarks, attachments)
          VALUES (p_faculty_id, p_leave_type_id, p_start_date, p_end_date, p_total_days, p_reason, p_leave_category, p_is_during_exam, p_contact, p_remarks, p_attachments);
          
          SET p_leave_id = LAST_INSERT_ID();
          
          UPDATE leave_balances 
          SET reserved = reserved + p_total_days
          WHERE faculty_id = p_faculty_id AND leave_type_id = p_leave_type_id AND year = YEAR(CURDATE());
          
          SET p_result = 'SUCCESS';
        ELSE
          SET p_result = 'INSUFFICIENT_BALANCE';
          SET p_leave_id = NULL;
        END IF;
      END IF;
    END IF;
  END IF;
END //

-- Approve/Reject Leave with History
DROP PROCEDURE IF EXISTS sp_update_leave_status;
CREATE PROCEDURE sp_update_leave_status(
  IN p_leave_id INT,
  IN p_reviewer_id INT,
  IN p_status ENUM('APPROVED','REJECTED'),
  IN p_reason TEXT
)
BEGIN
  DECLARE v_faculty_id INT;
  DECLARE v_leave_type_id INT;
  DECLARE v_total_days FLOAT;
  DECLARE v_new_balance FLOAT;
  
  SELECT faculty_id, leave_type_id, total_days 
  INTO v_faculty_id, v_leave_type_id, v_total_days
  FROM leave_applications WHERE id = p_leave_id;
  
  UPDATE leave_applications 
  SET status = p_status, reviewer_id = p_reviewer_id, review_reason = p_reason, reviewed_at = CURRENT_TIMESTAMP
  WHERE id = p_leave_id;
  
  IF p_status = 'APPROVED' THEN
    UPDATE leave_balances 
    SET balance = balance - v_total_days, reserved = reserved - v_total_days
    WHERE faculty_id = v_faculty_id AND leave_type_id = v_leave_type_id AND year = YEAR(CURDATE());
    
    SELECT balance INTO v_new_balance FROM leave_balances
    WHERE faculty_id = v_faculty_id AND leave_type_id = v_leave_type_id AND year = YEAR(CURDATE());
    
    INSERT INTO leave_accrual_history (faculty_id, leave_type_id, accrual_date, accrual_amount, total_balance_after, note)
    VALUES (v_faculty_id, v_leave_type_id, CURDATE(), -v_total_days, v_new_balance, CONCAT('Leave approved - Application #', p_leave_id));
  ELSE
    UPDATE leave_balances 
    SET reserved = reserved - v_total_days
    WHERE faculty_id = v_faculty_id AND leave_type_id = v_leave_type_id AND year = YEAR(CURDATE());
  END IF;
END //

-- Yearly Leave Accrual with Pro-rating (set-based)
DROP PROCEDURE IF EXISTS sp_yearly_leave_accrual;
CREATE PROCEDURE sp_yearly_leave_accrual()
BEGIN
  INSERT INTO leave_balances (faculty_id, leave_type_id, year, balance)
  SELECT f.id, lr.leave_type_id, YEAR(CURDATE()),
    CASE
      WHEN YEAR(COALESCE(f.doj, CURDATE())) = YEAR(CURDATE())
      THEN lr.accrual_rate * GREATEST(12 - MONTH(COALESCE(f.doj, CURDATE())) + 1, 0) / 12
      ELSE lr.accrual_rate
    END
  FROM faculty f
  JOIN leave_rules lr ON f.faculty_type_id = lr.faculty_type_id
  WHERE f.active = TRUE AND f.approved = TRUE
    AND lr.accrual_period = 'YEARLY'
    AND NOT (lr.probation_excluded = TRUE AND TIMESTAMPDIFF(MONTH, COALESCE(f.doj, CURDATE()), CURDATE()) < 6)
    AND TIMESTAMPDIFF(MONTH, COALESCE(f.doj, CURDATE()), CURDATE()) >= COALESCE(lr.min_service_months, 0)
  ON DUPLICATE KEY UPDATE balance = LEAST(
    COALESCE(balance, 0) + VALUES(balance),
    COALESCE(
      (SELECT lr2.max_balance FROM leave_rules lr2
       JOIN faculty f2 ON f2.faculty_type_id = lr2.faculty_type_id
       WHERE f2.id = VALUES(faculty_id) AND lr2.leave_type_id = VALUES(leave_type_id)
         AND lr2.accrual_period = 'YEARLY'
       LIMIT 1),
      999999
    )
  );

  INSERT INTO leave_accrual_history (faculty_id, leave_type_id, accrual_date, accrual_amount, total_balance_after, note)
  SELECT f.id, lr.leave_type_id, CURDATE(),
    CASE
      WHEN YEAR(COALESCE(f.doj, CURDATE())) = YEAR(CURDATE())
      THEN lr.accrual_rate * GREATEST(12 - MONTH(COALESCE(f.doj, CURDATE())) + 1, 0) / 12
      ELSE lr.accrual_rate
    END,
    COALESCE((SELECT balance FROM leave_balances lb
              WHERE lb.faculty_id = f.id AND lb.leave_type_id = lr.leave_type_id AND lb.year = YEAR(CURDATE())), 0),
    'Yearly accrual'
  FROM faculty f
  JOIN leave_rules lr ON f.faculty_type_id = lr.faculty_type_id
  WHERE f.active = TRUE AND f.approved = TRUE
    AND lr.accrual_period = 'YEARLY'
    AND NOT (lr.probation_excluded = TRUE AND TIMESTAMPDIFF(MONTH, COALESCE(f.doj, CURDATE()), CURDATE()) < 6)
    AND TIMESTAMPDIFF(MONTH, COALESCE(f.doj, CURDATE()), CURDATE()) >= COALESCE(lr.min_service_months, 0);
END //

-- Carry Forward Leave Balances to New Year (set-based)
DROP PROCEDURE IF EXISTS sp_carry_forward_leaves;
CREATE PROCEDURE sp_carry_forward_leaves()
BEGIN
  INSERT INTO leave_balances (faculty_id, leave_type_id, year, balance)
  SELECT lb.faculty_id, lb.leave_type_id, YEAR(CURDATE()),
    CASE WHEN COALESCE(lr.carry_forward, FALSE) = TRUE
      THEN LEAST(lb.balance, COALESCE(lr.max_balance, lb.balance))
      ELSE 0
    END
  FROM leave_balances lb
  JOIN faculty f ON lb.faculty_id = f.id
  JOIN leave_rules lr ON f.faculty_type_id = lr.faculty_type_id AND lr.leave_type_id = lb.leave_type_id
  WHERE lb.year = YEAR(CURDATE()) - 1 AND f.active = TRUE
  ON DUPLICATE KEY UPDATE balance = VALUES(balance);

  INSERT INTO leave_accrual_history (faculty_id, leave_type_id, accrual_date, accrual_amount, total_balance_after, note)
  SELECT lb.faculty_id, lb.leave_type_id, CURDATE(),
    CASE WHEN COALESCE(lr.carry_forward, FALSE) = TRUE
      THEN LEAST(lb.balance, COALESCE(lr.max_balance, lb.balance))
      ELSE 0
    END,
    CASE WHEN COALESCE(lr.carry_forward, FALSE) = TRUE
      THEN LEAST(lb.balance, COALESCE(lr.max_balance, lb.balance))
      ELSE 0
    END,
    'Carry forward from previous year'
  FROM leave_balances lb
  JOIN faculty f ON lb.faculty_id = f.id
  JOIN leave_rules lr ON f.faculty_type_id = lr.faculty_type_id AND lr.leave_type_id = lb.leave_type_id
  WHERE lb.year = YEAR(CURDATE()) - 1 AND f.active = TRUE
    AND COALESCE(lr.carry_forward, FALSE) = TRUE
    AND LEAST(lb.balance, COALESCE(lr.max_balance, lb.balance)) > 0;
END //

-- Get Progressive Rate based on Service Tenure
DROP FUNCTION IF EXISTS fn_get_progressive_rate;
CREATE FUNCTION fn_get_progressive_rate(p_months INT, p_rule_id INT)
RETURNS FLOAT
DETERMINISTIC
BEGIN
  DECLARE v_json JSON;
  DECLARE v_rate FLOAT;
  
  SELECT progressive_json INTO v_json FROM leave_rules WHERE id = p_rule_id;
  
  IF v_json IS NULL THEN
    SELECT accrual_rate INTO v_rate FROM leave_rules WHERE id = p_rule_id;
    RETURN v_rate;
  END IF;
  
  IF p_months <= 24 THEN
    SET v_rate = JSON_UNQUOTE(JSON_EXTRACT(v_json, '$."0-24"'));
  ELSEIF p_months <= 60 THEN
    SET v_rate = JSON_UNQUOTE(JSON_EXTRACT(v_json, '$."25-60"'));
  ELSE
    SET v_rate = JSON_UNQUOTE(JSON_EXTRACT(v_json, '$."61-120"'));
  END IF;
  
  RETURN COALESCE(v_rate, 0);
END //

-- Admin Update Leave Balance
DROP PROCEDURE IF EXISTS sp_admin_update_leave_balance;
CREATE PROCEDURE sp_admin_update_leave_balance(
  IN p_faculty_id INT,
  IN p_leave_type_id INT,
  IN p_new_balance FLOAT,
  IN p_admin_id INT,
  IN p_reason TEXT
)
BEGIN
  DECLARE v_old_balance FLOAT;
  DECLARE v_adjustment FLOAT;
  
  SELECT balance INTO v_old_balance
  FROM leave_balances
  WHERE faculty_id = p_faculty_id AND leave_type_id = p_leave_type_id AND year = YEAR(CURDATE());
  
  IF v_old_balance IS NULL THEN
    INSERT INTO leave_balances (faculty_id, leave_type_id, year, balance)
    VALUES (p_faculty_id, p_leave_type_id, YEAR(CURDATE()), p_new_balance);
    SET v_adjustment = p_new_balance;
  ELSE
    UPDATE leave_balances
    SET balance = p_new_balance
    WHERE faculty_id = p_faculty_id AND leave_type_id = p_leave_type_id AND year = YEAR(CURDATE());
    SET v_adjustment = p_new_balance - v_old_balance;
  END IF;
  
  INSERT INTO leave_accrual_history (faculty_id, leave_type_id, accrual_date, accrual_amount, total_balance_after, note)
  VALUES (p_faculty_id, p_leave_type_id, CURDATE(), v_adjustment, p_new_balance, CONCAT('Admin adjustment: ', p_reason));
  
  INSERT INTO admin_logs (admin_id, action_type, resource_type, resource_id, payload, before_state, after_state, reason)
  VALUES (
    p_admin_id,
    'UPDATE_LEAVE_BALANCE',
    'leave_balance',
    p_faculty_id,
    JSON_OBJECT('leave_type_id', p_leave_type_id),
    JSON_OBJECT('balance', v_old_balance),
    JSON_OBJECT('balance', p_new_balance),
    p_reason
  );
END //

-- Permanent Delete User (Super Admin Only)
DROP PROCEDURE IF EXISTS sp_permanent_delete_user;
CREATE PROCEDURE sp_permanent_delete_user(
  IN p_faculty_id INT,
  IN p_admin_id INT,
  IN p_reason TEXT
)
BEGIN
  DECLARE v_user_data JSON;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  
  START TRANSACTION;
  
  SELECT JSON_OBJECT(
    'employee_id', employee_id,
    'name', name,
    'email', email,
    'department', department,
    'designation', designation
  ) INTO v_user_data
  FROM faculty WHERE id = p_faculty_id;
  
  DELETE FROM leave_adjustments WHERE leave_application_id IN (SELECT id FROM leave_applications WHERE faculty_id = p_faculty_id);
  DELETE FROM leave_applications WHERE faculty_id = p_faculty_id;
  DELETE FROM leave_accrual_history WHERE faculty_id = p_faculty_id;
  DELETE FROM leave_balances WHERE faculty_id = p_faculty_id;
  DELETE FROM product_requests WHERE faculty_id = p_faculty_id;
  DELETE FROM form_submissions WHERE faculty_id = p_faculty_id;
  DELETE FROM vault_access_logs WHERE file_id IN (SELECT id FROM vault_files WHERE faculty_id = p_faculty_id);
  DELETE FROM vault_file_shares WHERE file_id IN (SELECT id FROM vault_files WHERE faculty_id = p_faculty_id);
  DELETE FROM vault_files WHERE faculty_id = p_faculty_id;
  DELETE FROM timetable_access_logs WHERE file_id IN (SELECT id FROM timetable_files WHERE uploaded_by = p_faculty_id);
  DELETE FROM timetable_files WHERE uploaded_by = p_faculty_id;
  DELETE FROM timetable WHERE faculty_id = p_faculty_id;
  DELETE FROM course_plans WHERE faculty_id = p_faculty_id;
  DELETE FROM research_projects WHERE faculty_id = p_faculty_id;
  DELETE FROM faculty_activity_logs WHERE faculty_id = p_faculty_id;
  DELETE FROM faculty_history WHERE faculty_id = p_faculty_id;
  DELETE FROM auth_tokens WHERE faculty_id = p_faculty_id;
  
  INSERT INTO admin_logs (admin_id, action_type, resource_type, resource_id, before_state, reason)
  VALUES (p_admin_id, 'PERMANENT_DELETE_USER', 'faculty', p_faculty_id, v_user_data, p_reason);
  
  DELETE FROM faculty WHERE id = p_faculty_id;
  
  COMMIT;
END //

DELIMITER ;

-- ============================================
-- TRIGGERS
-- ============================================

DELIMITER //

-- Auto-assign leaves on faculty approval
DROP TRIGGER IF EXISTS trg_faculty_approved;
CREATE TRIGGER trg_faculty_approved
AFTER UPDATE ON faculty
FOR EACH ROW
BEGIN
  IF NEW.approved = 1 AND OLD.approved = 0 THEN
    CALL sp_assign_default_leaves(NEW.id);
  END IF;
END //

-- Track faculty changes
DROP TRIGGER IF EXISTS trg_faculty_history_update;
CREATE TRIGGER trg_faculty_history_update
AFTER UPDATE ON faculty
FOR EACH ROW
BEGIN
  IF OLD.designation != NEW.designation THEN
    INSERT INTO faculty_history (faculty_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'designation', OLD.designation, NEW.designation);
  END IF;
  
  IF OLD.department != NEW.department THEN
    INSERT INTO faculty_history (faculty_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'department', OLD.department, NEW.department);
  END IF;
END //

-- Prevent timetable conflicts
DROP TRIGGER IF EXISTS trg_check_timetable_conflict;
CREATE TRIGGER trg_check_timetable_conflict
BEFORE INSERT ON timetable
FOR EACH ROW
BEGIN
  DECLARE conflict_count INT;
  
  SELECT COUNT(*) INTO conflict_count
  FROM timetable
  WHERE faculty_id = NEW.faculty_id
    AND day_of_week = NEW.day_of_week
    AND (
      (NEW.start_time BETWEEN start_time AND end_time) OR
      (NEW.end_time BETWEEN start_time AND end_time) OR
      (start_time BETWEEN NEW.start_time AND NEW.end_time)
    );
  
  IF conflict_count > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Timetable conflict detected';
  END IF;
END //

DELIMITER ;

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

CREATE VIEW v_leave_summary AS
SELECT 
  f.department,
  lt.name AS leave_type,
  SUM(lb.balance) AS total_balance,
  SUM(lb.reserved) AS total_reserved,
  COUNT(DISTINCT f.id) AS faculty_count,
  SUM(CASE WHEN la.status='APPROVED' THEN la.total_days ELSE 0 END) AS total_approved_days
FROM faculty f
JOIN leave_balances lb ON f.id = lb.faculty_id
JOIN leave_types lt ON lt.id = lb.leave_type_id
LEFT JOIN leave_applications la ON la.faculty_id = f.id AND la.leave_type_id = lt.id
WHERE f.active = TRUE
GROUP BY f.department, lt.name;

CREATE VIEW v_faculty_workload AS
SELECT 
  f.id,
  f.name,
  f.department,
  COUNT(DISTINCT t.course_id) AS courses_assigned,
  SUM(c.credits) AS total_credits,
  COUNT(t.id) AS total_classes_per_week
FROM faculty f
LEFT JOIN timetable t ON f.id = t.faculty_id
LEFT JOIN courses c ON t.course_id = c.id
WHERE f.active = TRUE
GROUP BY f.id, f.name, f.department;

CREATE VIEW v_pending_approvals AS
SELECT 
  'LEAVE' AS type,
  la.id,
  f.name AS faculty_name,
  f.department,
  lt.name AS leave_type,
  la.start_date,
  la.end_date,
  la.created_at
FROM leave_applications la
JOIN faculty f ON la.faculty_id = f.id
JOIN leave_types lt ON la.leave_type_id = lt.id
WHERE la.status = 'PENDING'
UNION ALL
SELECT 
  'PRODUCT' AS type,
  pr.id,
  f.name AS faculty_name,
  f.department,
  pr.item_name,
  NULL,
  NULL,
  pr.created_at
FROM product_requests pr
JOIN faculty f ON pr.faculty_id = f.id
WHERE pr.status = 'PENDING'
UNION ALL
SELECT 
  'FACULTY' AS type,
  f.id,
  f.name AS faculty_name,
  f.department,
  f.designation,
  NULL,
  NULL,
  f.created_at
FROM faculty f
WHERE f.approved = FALSE AND f.active = TRUE;

CREATE VIEW v_research_stats AS
SELECT 
  f.id,
  f.name,
  f.department,
  COUNT(rp.id) AS total_publications,
  SUM(CASE WHEN rp.type = 'Journal' THEN 1 ELSE 0 END) AS journals,
  SUM(CASE WHEN rp.type = 'Conference' THEN 1 ELSE 0 END) AS conferences,
  SUM(CASE WHEN rp.type = 'Patent' THEN 1 ELSE 0 END) AS patents
FROM faculty f
LEFT JOIN research_projects rp ON f.id = rp.faculty_id
WHERE f.active = TRUE
GROUP BY f.id, f.name, f.department;

CREATE VIEW v_faculty_leave_availability AS
SELECT 
  f.id AS faculty_id,
  f.name AS faculty_name,
  f.doj,
  TIMESTAMPDIFF(MONTH, f.doj, CURDATE()) AS service_months,
  lt.id AS leave_type_id,
  lt.code,
  lt.name AS leave_name,
  lb.year,
  lb.balance,
  lb.reserved,
  (lb.balance - lb.reserved) AS available,
  lr.accrual_rate,
  lr.accrual_period,
  lr.max_balance,
  lr.min_service_months,
  CASE 
    WHEN lr.probation_excluded = TRUE AND TIMESTAMPDIFF(MONTH, f.doj, CURDATE()) < 6 THEN FALSE
    WHEN TIMESTAMPDIFF(MONTH, f.doj, CURDATE()) < lr.min_service_months THEN FALSE
    ELSE TRUE
  END AS is_eligible
FROM faculty f
JOIN leave_balances lb ON lb.faculty_id = f.id
JOIN leave_types lt ON lt.id = lb.leave_type_id
LEFT JOIN leave_rules lr ON lr.faculty_type_id = f.faculty_type_id AND lr.leave_type_id = lt.id
WHERE f.active = TRUE AND f.approved = TRUE;

-- ============================================
-- INITIAL ADMIN / FIRST-RUN SETUP
-- ============================================
-- SECURITY: No default credentials are seeded.
-- Run the seed script after first boot to create the first SUPER_ADMIN.
--   cd backend && npm run seed:admin
-- The script will prompt for an email, full name, and password,
-- bcrypt-hash the password, and insert the first SUPER_ADMIN.
--
-- Sample test accounts have been intentionally removed because the
-- password hashes were committed to the repository. Operators must
-- create all accounts through the seed script or the admin UI.

-- Insert sample leave form
INSERT IGNORE INTO form_definitions (name, category, description, active) 
VALUES ('Standard Leave Application', 'LEAVE', 'Default leave application form', TRUE);

SET @form_id = LAST_INSERT_ID();

INSERT IGNORE INTO form_fields (form_id, name, label, type, required, order_index) VALUES
(@form_id, 'leave_type', 'Leave Type', 'select', TRUE, 1),
(@form_id, 'start_date', 'Start Date', 'date', TRUE, 2),
(@form_id, 'end_date', 'End Date', 'date', TRUE, 3),
(@form_id, 'reason', 'Reason', 'textarea', TRUE, 4),
(@form_id, 'contact_during_leave', 'Contact Number', 'text', FALSE, 5);


-- ============================================
-- CONTINUATION: Foundation rewrite (merged from migrations/002_foundation_rewrite.sql)
-- ============================================
-- =============================================================================
-- Migration 002 — Foundation rewrite
--
-- This migration introduces the new infrastructure for the big-bang rewrite
-- (areas 1, 5, 6, 7, 8, 9 of the plan). It is BACKWARD COMPATIBLE: all
-- existing tables, columns, stored procedures, and API contracts continue
-- to work. The new tables exist alongside the old ones; the application
-- will gradually migrate to using the new tables.
--
-- New tables introduced here:
--   - master_codes                       (replaces ENUMs in app code)
--   - organizations                      (multi-tenant foundation)
--   - campuses                           (multi-tenant foundation)
--   - departments                        (replaces free-text department)
--   - audit_logs                         (unified audit, dual-written)
--   - workflow_definitions / steps / instances / step_assignments
--   - rule_conditions / rule_actions     (extensible leave rule engine)
--   - leave_rule_versions / version_actions
--
-- Soft delete:
--   faculty gains a `marked_for_purge_after` column. The legacy
--   `sp_permanent_delete_user` procedure is NOT removed in this migration;
--   it is wrapped in a soft-delete path by the application layer.
--
-- NOTE: this migration is idempotent where possible (CREATE TABLE IF NOT
-- EXISTS, INSERT IGNORE). Re-running is safe.
-- =============================================================================

-- --------------------------------------------------------------------
-- 1) Multi-tenant foundation
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  config JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO organizations (id, code, name, active, config)
VALUES (1, 'DEFAULT', 'Default Organization', TRUE, JSON_OBJECT('is_default', TRUE));

CREATE TABLE IF NOT EXISTS campuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(200) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_campus_code (organization_id, code),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add organization_id column to faculty (default to 1) without breaking
-- the existing schema. IF NOT EXISTS-style via INFORMATION_SCHEMA is verbose
-- in MySQL, so we use a stored-procedure-style guard.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'faculty'
    AND column_name = 'organization_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE faculty ADD COLUMN organization_id INT NOT NULL DEFAULT 1, ADD FOREIGN KEY (organization_id) REFERENCES organizations(id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --------------------------------------------------------------------
-- 2) master_codes — the unified lookup table
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100),
  display_order INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_category_code (category, code),
  INDEX idx_category_active (category, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed master_codes with the values currently in the ENUMs. The
-- application uses `code` everywhere; the `name` is just a friendly label.
INSERT IGNORE INTO master_codes (category, code, name, display_order) VALUES
  -- roles (kept in sync with the `roles` table for now)
  ('role',           'FACULTY',     'Faculty',       10),
  ('role',           'ADMIN',       'Administrator', 20),
  ('role',           'HOD',         'Head of Department', 30),
  ('role',           'SUPER_ADMIN', 'Super Administrator', 40),
  -- form categories
  ('form_category',  'LEAVE',       'Leave',          10),
  ('form_category',  'COURSE',      'Course',         20),
  ('form_category',  'PRODUCT',     'Product',        30),
  ('form_category',  'PROFILE',     'Profile',        40),
  ('form_category',  'RESEARCH',    'Research',       50),
  ('form_category',  'PERFORMANCE', 'Performance',    60),
  -- form submission categories (slightly different set)
  ('form_submission_category', 'LEAVE',       'Leave',       10),
  ('form_submission_category', 'PRODUCT',     'Product',     20),
  ('form_submission_category', 'COURSE',      'Course',      30),
  ('form_submission_category', 'VAULTIFY',    'Vaultify',    40),
  ('form_submission_category', 'RESEARCH',    'Research',    50),
  ('form_submission_category', 'PERFORMANCE', 'Performance', 60),
  -- form field types
  ('form_field_type', 'text',     'Text',     10),
  ('form_field_type', 'number',   'Number',   20),
  ('form_field_type', 'textarea', 'Textarea', 30),
  ('form_field_type', 'select',   'Select',   40),
  ('form_field_type', 'date',     'Date',     50),
  ('form_field_type', 'checkbox', 'Checkbox', 60),
  ('form_field_type', 'file',     'File',     70),
  ('form_field_type', 'signature','Signature',80),
  -- approval / status
  ('approval_status', 'PENDING',     'Pending',     10),
  ('approval_status', 'APPROVED',    'Approved',    20),
  ('approval_status', 'REJECTED',    'Rejected',    30),
  ('approval_status', 'CANCELLED',   'Cancelled',   40),
  ('approval_status', 'DELETED',     'Deleted',     50),
  ('approval_status', 'IN_PROGRESS', 'In Progress', 60),
  -- leave-specific
  ('leave_period', 'DAILY',    'Daily',    10),
  ('leave_period', 'MONTHLY',  'Monthly',  20),
  ('leave_period', 'YEARLY',   'Yearly',   30),
  ('leave_period', 'ONE_TIME', 'One Time', 40),
  -- gender / restriction
  ('gender',             'MALE',   'Male',   10),
  ('gender',             'FEMALE', 'Female', 20),
  ('gender',             'OTHER',  'Other',  30),
  ('gender_restriction', 'ALL',    'All',    10),
  ('gender_restriction', 'MALE',   'Male',   20),
  ('gender_restriction', 'FEMALE', 'Female', 30),
  -- faculty type category
  ('faculty_type_category', 'Teaching',    'Teaching',    10),
  ('faculty_type_category', 'NonTeaching', 'Non-Teaching',20),
  ('faculty_type_category', 'Contract',    'Contract',    30),
  ('faculty_type_category', 'Visiting',    'Visiting',    40),
  -- vault / file visibility
  ('visibility', 'PRIVATE',   'Private',   10),
  ('visibility', 'DEPARTMENT','Department', 20),
  ('visibility', 'PUBLIC',    'Public',    30),
  ('visibility', 'SHARED',    'Shared',    40),
  -- vault / timetable access log actions
  ('vault_action',     'UPLOAD',   'Upload',   10),
  ('vault_action',     'DOWNLOAD', 'Download', 20),
  ('vault_action',     'VIEW',     'View',     30),
  ('vault_action',     'DELETE',   'Delete',   40),
  ('vault_action',     'SHARE',    'Share',    50),
  ('timetable_action', 'UPLOAD',   'Upload',   10),
  ('timetable_action', 'VIEW',     'View',     20),
  ('timetable_action', 'DOWNLOAD', 'Download', 30),
  ('timetable_action', 'ASSIGN',   'Assign',   40),
  ('timetable_action', 'UNASSIGN', 'Unassign', 50),
  ('timetable_action', 'DELETE',   'Delete',   60),
  -- timetable domain
  ('timetable_mode', 'OFFLINE', 'Offline', 10),
  ('timetable_mode', 'ONLINE',  'Online',  20),
  ('timetable_day',  'MON', 'Monday',    10),
  ('timetable_day',  'TUE', 'Tuesday',   20),
  ('timetable_day',  'WED', 'Wednesday', 30),
  ('timetable_day',  'THU', 'Thursday',  40),
  ('timetable_day',  'FRI', 'Friday',    50),
  ('timetable_day',  'SAT', 'Saturday',  60),
  -- research / announcements
  ('course_plan_status',  'DRAFT',     'Draft',     10),
  ('course_plan_status',  'SUBMITTED', 'Submitted', 20),
  ('course_plan_status',  'APPROVED',  'Approved',  30),
  ('research_type',  'Paper',     'Paper',     10),
  ('research_type',  'Journal',   'Journal',   20),
  ('research_type',  'Conference','Conference',30),
  ('research_type',  'Patent',    'Patent',    40),
  ('research_type',  'Book',      'Book',      50),
  ('research_type',  'Chapter',   'Chapter',   60),
  ('research_status','Published',   'Published',    10),
  ('research_status','Under Review','Under Review',20),
  ('research_status','In Progress', 'In Progress', 30),
  ('announcement_priority', 'LOW',    'Low',    10),
  ('announcement_priority', 'MEDIUM', 'Medium', 20),
  ('announcement_priority', 'HIGH',   'High',   30),
  ('announcement_priority', 'URGENT', 'Urgent', 40),
  -- leave category (leave_applications.leave_category)
  ('leave_category',      'FULL_DAY',   'Full Day',   10),
  ('leave_category',      'HALF_DAY',   'Half Day',   20),
  ('leave_category',      'SHORT_LEAVE','Short Leave',30),
  -- confirmation status (leave_adjustments.confirmation_status)
  ('confirmation_status', 'PENDING',  'Pending',  10),
  ('confirmation_status', 'CONFIRMED','Confirmed', 20),
  ('confirmation_status', 'DECLINED', 'Declined',  30),
  -- timetable created_via
  ('created_via',         'MANUAL', 'Manual', 10),
  ('created_via',         'UPLOAD', 'Upload', 20),
  -- audit_logs.actor_type
  ('actor_type', 'USER',   'User',   10),
  ('actor_type', 'SYSTEM', 'System', 20),
  ('actor_type', 'CRON',   'Cron',   30),
  -- workflow_steps.assignee_type
  ('assignee_type', 'ROLE',              'Role',               10),
  ('assignee_type', 'USER',              'User',               20),
  ('assignee_type', 'DEPARTMENT_HEAD',   'Department Head',    30),
  ('assignee_type', 'REPORTING_MANAGER', 'Reporting Manager',  40),
  -- rule_conditions.operator
  ('rule_operator', '=',       'Equals',                 10),
  ('rule_operator', '!=',      'Not Equals',             20),
  ('rule_operator', '>',       'Greater Than',           30),
  ('rule_operator', '>=',      'Greater Than or Equal',  40),
  ('rule_operator', '<',       'Less Than',              50),
  ('rule_operator', '<=',      'Less Than or Equal',     60),
  ('rule_operator', 'IN',      'In',                     70),
  ('rule_operator', 'NOT_IN',  'Not In',                 80),
  ('rule_operator', 'CONTAINS','Contains',               90),
  -- Add SKIPPED to the existing approval_status set
  ('approval_status', 'SKIPPED', 'Skipped', 55);

-- --------------------------------------------------------------------
-- 3) departments
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL DEFAULT 1,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_dept_code (organization_id, code),
  INDEX idx_org_active (organization_id, active),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed departments from any non-empty distinct values in faculty.department.
-- This is best-effort: the migration script is idempotent and skips blanks.
INSERT IGNORE INTO departments (code, name)
SELECT DISTINCT UPPER(TRIM(department)), TRIM(department)
FROM faculty
WHERE department IS NOT NULL AND TRIM(department) <> '';

-- Add department_id column to faculty (nullable; legacy column stays).
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'faculty'
    AND column_name = 'department_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE faculty ADD COLUMN department_id INT NULL, ADD INDEX idx_department_id (department_id), ADD FOREIGN KEY (department_id) REFERENCES departments(id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill department_id where we can match by name.
UPDATE faculty f
JOIN departments d ON d.organization_id = 1 AND d.name = TRIM(f.department)
SET f.department_id = d.id
WHERE f.department_id IS NULL;

-- --------------------------------------------------------------------
-- 4) audit_logs — unified audit (dual-write with admin_logs is the
-- application's job; we just create the table here).
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL DEFAULT 1,
  actor_id INT NULL,                       -- null for SYSTEM / CRON
  actor_type ENUM('USER', 'SYSTEM', 'CRON') DEFAULT 'USER',
  action VARCHAR(100) NOT NULL,            -- e.g. 'user.created', 'leave.approved'
  entity_type VARCHAR(50) NOT NULL,        -- e.g. 'faculty', 'leave_application'
  entity_id BIGINT NULL,
  entity_label VARCHAR(255) NULL,          -- human-readable label
  before_state JSON NULL,
  after_state JSON NULL,
  metadata JSON NULL,                      -- ip_address, user_agent, reason, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_actor (actor_id),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_action (action),
  INDEX idx_created (created_at),
  INDEX idx_org (organization_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill historical admin_logs into audit_logs (best effort).
INSERT IGNORE INTO audit_logs
  (organization_id, actor_id, actor_type, action, entity_type, entity_id,
   before_state, after_state, metadata, created_at)
SELECT
  1, al.admin_id, 'USER', al.action_type, al.resource_type, al.resource_id,
  al.before_state, al.after_state,
  JSON_OBJECT(
    'reason', al.reason,
    'ip_address', al.ip_address,
    'user_agent', al.user_agent,
    'migrated_from', 'admin_logs'
  ),
  al.created_at
FROM admin_logs al
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs ax
  WHERE ax.action = al.action_type
    AND ax.entity_type = al.resource_type
    AND (ax.entity_id = al.resource_id OR (ax.entity_id IS NULL AND al.resource_id IS NULL))
    AND ax.created_at = al.created_at
);

-- --------------------------------------------------------------------
-- 5) workflow_*
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id INT NOT NULL,
  step_order INT NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  assignee_type ENUM('ROLE', 'USER', 'DEPARTMENT_HEAD', 'REPORTING_MANAGER') NOT NULL,
  assignee_value VARCHAR(100) NULL,
  allow_self_approve BOOLEAN DEFAULT FALSE,
  timeout_days INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_workflow_order (workflow_id, step_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_instances (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL DEFAULT 1,
  workflow_id INT NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id BIGINT NOT NULL,
  current_step_id INT NULL,
  status ENUM('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED') DEFAULT 'PENDING',
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_status (status),
  INDEX idx_workflow (workflow_id),
  FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (current_step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES faculty(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_step_assignments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  instance_id BIGINT NOT NULL,
  step_id INT NOT NULL,
  assignee_id INT NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED') DEFAULT 'PENDING',
  comment TEXT,
  acted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_instance (instance_id),
  INDEX idx_assignee (assignee_id, status),
  FOREIGN KEY (instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES workflow_steps(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES faculty(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the four default workflows + steps.
INSERT IGNORE INTO workflow_definitions (id, code, name) VALUES
  (1, 'LEAVE',           'Leave approval'),
  (2, 'PRODUCT_REQUEST', 'Product request approval'),
  (3, 'FORM_SUBMISSION', 'Generic form submission approval'),
  (4, 'TIMETABLE',       'Timetable assignment approval');

-- Seed default steps for LEAVE: HOD then ADMIN. For others: ADMIN only.
INSERT IGNORE INTO workflow_steps (id, workflow_id, step_order, step_name, assignee_type, assignee_value, allow_self_approve) VALUES
  (1, 1, 1, 'HOD review',     'ROLE', 'HOD', FALSE),
  (2, 1, 2, 'Admin approval', 'ROLE', 'ADMIN', FALSE),
  (3, 2, 1, 'Admin review',   'ROLE', 'ADMIN', FALSE)
;

-- ============================================
-- CONTINUATION: Foundation rewrite part 2 (merged from migrations/002_part2.sql)
-- ============================================
-- =============================================================================
-- Migration 002 — Part 2 (continuation)
-- Append this AFTER 002_foundation_rewrite.sql is applied.
-- This file is also idempotent.
-- =============================================================================

-- Finish the workflow_steps seed (the parent file was truncated mid-statement).
INSERT IGNORE INTO workflow_steps (id, workflow_id, step_order, step_name, assignee_type, assignee_value, allow_self_approve) VALUES
  (4, 3, 1, 'Admin review',   'ROLE', 'ADMIN', FALSE),
  (5, 4, 1, 'Admin review',   'ROLE', 'ADMIN', FALSE);

-- --------------------------------------------------------------------
-- 6) Extensible leave rule engine foundation
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rule_conditions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id INT NOT NULL,
  field_name VARCHAR(50) NOT NULL,
  operator ENUM('=', '!=', '>', '>=', '<', '<=', 'IN', 'NOT_IN', 'CONTAINS') NOT NULL,
  value VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rule (rule_id),
  FOREIGN KEY (rule_id) REFERENCES leave_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rule_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id INT NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  action_value VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rule (rule_id),
  FOREIGN KEY (rule_id) REFERENCES leave_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill rule_conditions and rule_actions from existing leave_rules rows,
-- so the existing rows can be queried through the new shape.
INSERT IGNORE INTO rule_conditions (rule_id, field_name, operator, value)
SELECT id, 'faculty_type_id', '=', CAST(faculty_type_id AS CHAR)
FROM leave_rules;

INSERT IGNORE INTO rule_actions (rule_id, action_type, action_value)
SELECT id, 'ACCRUAL_RATE',  CAST(accrual_rate AS CHAR)  FROM leave_rules WHERE accrual_rate IS NOT NULL;
INSERT IGNORE INTO rule_actions (rule_id, action_type, action_value)
SELECT id, 'ACCRUAL_PERIOD', accrual_period              FROM leave_rules WHERE accrual_period IS NOT NULL;
INSERT IGNORE INTO rule_actions (rule_id, action_type, action_value)
SELECT id, 'MAX_BALANCE',    CAST(max_balance AS CHAR)    FROM leave_rules WHERE max_balance IS NOT NULL;
INSERT IGNORE INTO rule_actions (rule_id, action_type, action_value)
SELECT id, 'CARRY_FORWARD',  CAST(carry_forward AS CHAR)  FROM leave_rules;
INSERT IGNORE INTO rule_actions (rule_id, action_type, action_value)
SELECT id, 'PROBATION_EXCLUDED', CAST(probation_excluded AS CHAR) FROM leave_rules;
INSERT IGNORE INTO rule_actions (rule_id, action_type, action_value)
SELECT id, 'MIN_SERVICE_MONTHS', CAST(min_service_months AS CHAR) FROM leave_rules;

-- --------------------------------------------------------------------
-- 7) Leave rule versioning
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leave_rule_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_base_id INT NOT NULL,
  version INT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  active BOOLEAN DEFAULT TRUE,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rule_version (rule_base_id, version),
  INDEX idx_effective (effective_from, effective_to),
  FOREIGN KEY (rule_base_id) REFERENCES leave_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leave_rule_version_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version_id INT NOT NULL,
  condition_field VARCHAR(50) NULL,
  condition_operator VARCHAR(10) NULL,
  condition_value VARCHAR(255) NULL,
  action_type VARCHAR(50) NOT NULL,
  action_value VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_version (version_id),
  FOREIGN KEY (version_id) REFERENCES leave_rule_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed version 1 of every existing rule with the current state.
INSERT IGNORE INTO leave_rule_versions (rule_base_id, version, effective_from, note)
SELECT id, 1, COALESCE(effective_from, CURDATE()), 'Initial version from existing rule'
FROM leave_rules;

INSERT IGNORE INTO leave_rule_version_actions
  (version_id, condition_field, condition_operator, condition_value, action_type, action_value)
SELECT
  v.id, 'faculty_type_id', '=', CAST(lr.faculty_type_id AS CHAR), 'ACCRUAL_RATE', CAST(lr.accrual_rate AS CHAR)
FROM leave_rule_versions v JOIN leave_rules lr ON lr.id = v.rule_base_id
WHERE lr.accrual_rate IS NOT NULL;

INSERT IGNORE INTO leave_rule_version_actions
  (version_id, condition_field, condition_operator, condition_value, action_type, action_value)
SELECT v.id, 'faculty_type_id', '=', CAST(lr.faculty_type_id AS CHAR), 'ACCRUAL_PERIOD', lr.accrual_period
FROM leave_rule_versions v JOIN leave_rules lr ON lr.id = v.rule_base_id
WHERE lr.accrual_period IS NOT NULL;

INSERT IGNORE INTO leave_rule_version_actions
  (version_id, condition_field, condition_operator, condition_value, action_type, action_value)
SELECT v.id, 'faculty_type_id', '=', CAST(lr.faculty_type_id AS CHAR), 'MAX_BALANCE', CAST(lr.max_balance AS CHAR)
FROM leave_rule_versions v JOIN leave_rules lr ON lr.id = v.rule_base_id
WHERE lr.max_balance IS NOT NULL;

INSERT IGNORE INTO leave_rule_version_actions
  (version_id, condition_field, condition_operator, condition_value, action_type, action_value)
SELECT v.id, 'faculty_type_id', '=', CAST(lr.faculty_type_id AS CHAR), 'CARRY_FORWARD', CAST(lr.carry_forward AS CHAR)
FROM leave_rule_versions v JOIN leave_rules lr ON lr.id = v.rule_base_id;

INSERT IGNORE INTO leave_rule_version_actions
  (version_id, condition_field, condition_operator, condition_value, action_type, action_value)
SELECT v.id, 'faculty_type_id', '=', CAST(lr.faculty_type_id AS CHAR), 'PROBATION_EXCLUDED', CAST(lr.probation_excluded AS CHAR)
FROM leave_rule_versions v JOIN leave_rules lr ON lr.id = v.rule_base_id;

INSERT IGNORE INTO leave_rule_version_actions
  (version_id, condition_field, condition_operator, condition_value, action_type, action_value)
SELECT v.id, 'faculty_type_id', '=', CAST(lr.faculty_type_id AS CHAR), 'MIN_SERVICE_MONTHS', CAST(lr.min_service_months AS CHAR)
FROM leave_rule_versions v JOIN leave_rules lr ON lr.id = v.rule_base_id;

-- --------------------------------------------------------------------
-- 8) Soft delete support on faculty
-- --------------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'faculty'
    AND column_name = 'marked_for_purge_after'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE faculty ADD COLUMN marked_for_purge_after TIMESTAMP NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

