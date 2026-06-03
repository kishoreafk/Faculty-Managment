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
