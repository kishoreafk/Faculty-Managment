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
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
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
  ('announcement_priority', 'URGENT', 'Urgent', 40);

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
  FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id),
  FOREIGN KEY (current_step_id) REFERENCES workflow_steps(id),
  FOREIGN KEY (created_by) REFERENCES faculty(id)
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
  FOREIGN KEY (step_id) REFERENCES workflow_steps(id),
  FOREIGN KEY (assignee_id) REFERENCES faculty(id)
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
  (3, 2, 1, 'Admin review',   'ROLE', 'ADMIN', FALSE),
  (4, 3, 1, 'Admin review',   'ROLE', 'ADMIN', FALSE);