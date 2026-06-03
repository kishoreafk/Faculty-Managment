-- ============================================================================
-- Migration 001: Add auth_token_revocations table for access-token JTI
-- revocation and password_reset_tokens for password reset flow.
--
-- This migration is idempotent (uses IF NOT EXISTS where supported).
-- Run it after applying schema.sql on a fresh database, OR apply it
-- to an existing database to upgrade.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_token_revocations (
  jti VARCHAR(64) NOT NULL,
  faculty_id INT NOT NULL,
  reason VARCHAR(100) NOT NULL DEFAULT 'LOGOUT',
  revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  PRIMARY KEY (jti),
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
  INDEX idx_faculty (faculty_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional: switch refresh tokens to be tracked with JTI as well so we can
-- revoke a single refresh token. If you have an existing deployment, the
-- auth_tokens table may need a migration. The current schema already has
-- `refresh_token VARCHAR(512)`, so we just add a JTI column if missing.
-- Uses information_schema for MySQL 8.0 compatibility (ADD COLUMN IF NOT EXISTS
-- requires 8.0.28+).
SET @jti_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_tokens' AND COLUMN_NAME = 'jti');
SET @sql_add_col = IF(@jti_exists = 0,
  'ALTER TABLE auth_tokens ADD COLUMN jti VARCHAR(64) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql_add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_tokens' AND INDEX_NAME = 'idx_jti');
SET @sql_add_idx = IF(@idx_exists = 0,
  'ALTER TABLE auth_tokens ADD INDEX idx_jti (jti)',
  'SELECT 1');
PREPARE stmt FROM @sql_add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
