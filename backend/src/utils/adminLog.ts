/**
 * @deprecated Use AuditService from '../services/AuditService.js' instead.
 * This module is kept for backward compatibility during migration.
 * No new code should import from this file.
 */
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../config/database.js';
import { isProduction } from '../config/env.js';

export type AdminLogInsert = {
  adminId: number;
  actionType: string;
  resourceType: string;
  resourceId?: number | string | null;
  payload?: unknown;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const safeJson = (value: unknown): string | null => {
  if (value === undefined) return null;
  if (value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: 'unserializable_payload' });
  }
};

export const writeAdminLog = async (
  entry: AdminLogInsert,
  options?: { connection?: PoolConnection; poolOverride?: Pool }
): Promise<void> => {
  const executor = options?.connection ?? options?.poolOverride ?? pool;

  try {
    await executor.execute(
      `INSERT INTO admin_logs (
        admin_id,
        action_type,
        resource_type,
        resource_id,
        payload,
        before_state,
        after_state,
        reason,
        ip_address,
        user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.adminId,
        entry.actionType,
        entry.resourceType,
        entry.resourceId ?? null,
        safeJson(entry.payload),
        safeJson(entry.beforeState),
        safeJson(entry.afterState),
        entry.reason ?? null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null
      ]
    );
  } catch (error) {
    // Never break the main request flow because logging failed.
    if (!isProduction) {
      console.warn('[WARN] Failed to write admin log:', error);
    }
  }
};

export const logAdminActionFromReq = async (
  req: AuthRequest,
  entry: Omit<AdminLogInsert, 'adminId' | 'ipAddress' | 'userAgent'>,
  options?: { connection?: PoolConnection }
): Promise<void> => {
  if (!req.user?.id) return;

  await writeAdminLog(
    {
      adminId: req.user.id,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      ...entry
    },
    options
  );
};

export const isPrivilegedActor = (role?: string | null): boolean => {
  return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'HOD';
};
