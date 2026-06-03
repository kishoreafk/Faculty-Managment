import { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';

/**
 * Unified audit service.
 *
 * Writes to BOTH the new `audit_logs` table AND the legacy `admin_logs`
 * table during the migration period. The application reads from
 * `admin_logs` (existing API surface) and `audit_logs` (new API surface).
 * When the new surface is fully adopted, the dual-write can be removed.
 */
export interface AuditEntry {
  organizationId?: number;
  actorId: number | null;
  actorType?: 'USER' | 'SYSTEM' | 'CRON';
  action: string;
  entityType: string;
  entityId?: number | null;
  entityLabel?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type Connection = PoolConnection | undefined;

export class AuditService {
  /**
   * Record an audit entry. Always writes to the new `audit_logs` table
   * and, when an `actorId` is provided, also writes to the legacy
   * `admin_logs` table for backward compatibility.
   */
  static async log(entry: AuditEntry, connection: Connection = undefined): Promise<bigint> {
    const exec: any = connection ?? pool;
    const organizationId = entry.organizationId ?? 1;
    const actorType = entry.actorType ?? 'USER';
    const metadata = {
      ...(entry.metadata ?? {}),
      reason: entry.reason ?? null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null
    };

    // 1) New audit_logs table.
    const [newResult]: any = await exec.execute(
      `INSERT INTO audit_logs
         (organization_id, actor_id, actor_type, action, entity_type, entity_id,
          entity_label, before_state, after_state, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        entry.actorId,
        actorType,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.entityLabel ?? null,
        entry.beforeState !== undefined ? JSON.stringify(entry.beforeState) : null,
        entry.afterState  !== undefined ? JSON.stringify(entry.afterState)  : null,
        JSON.stringify(metadata)
      ]
    );
    const newId = newResult.insertId;

    // 2) Legacy admin_logs (only if there's an actor — system actions
    //    have actorId=null and were never written there).
    if (entry.actorId !== null) {
      try {
        await exec.execute(
          `INSERT INTO admin_logs
             (admin_id, action_type, resource_type, resource_id, payload, before_state, after_state, reason, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entry.actorId,
            entry.action,
            entry.entityType,
            entry.entityId ?? null,
            entry.metadata ? JSON.stringify(entry.metadata) : null,
            entry.beforeState !== undefined ? JSON.stringify(entry.beforeState) : null,
            entry.afterState  !== undefined ? JSON.stringify(entry.afterState)  : null,
            entry.reason ?? null,
            entry.ipAddress ?? null,
            entry.userAgent ?? null
          ]
        );
      } catch (e) {
        // Don't fail the calling operation if the legacy log is unavailable
        // (e.g., during a schema migration).
        // eslint-disable-next-line no-console
        console.warn('[AuditService] Legacy admin_logs write failed:', (e as Error).message);
      }
    }

    return BigInt(newId);
  }

  /**
   * Convenience wrapper: extract actor + ip + user-agent from an
   * Express request and log.
   */
  static async logFromRequest(req: AuthRequest, entry: Omit<AuditEntry, 'actorId' | 'ipAddress' | 'userAgent' | 'organizationId'>): Promise<bigint> {
    return AuditService.log({
      ...entry,
      actorId: req.user?.id ?? null,
      organizationId: 1, // single-tenant for now
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null
    });
  }

  /**
   * List audit entries with optional filters. Pagination-friendly.
   */
  static async list(filters: {
    organizationId?: number;
    actorId?: number;
    action?: string;
    entityType?: string;
    entityId?: number;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ total: number; page: number; pageSize: number; items: any[] }> {
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (filters.organizationId) { where.push('organization_id = ?'); params.push(filters.organizationId); }
    if (filters.actorId)        { where.push('actor_id = ?');        params.push(filters.actorId); }
    if (filters.action)         { where.push('action = ?');          params.push(filters.action); }
    if (filters.entityType)     { where.push('entity_type = ?');     params.push(filters.entityType); }
    if (filters.entityId)       { where.push('entity_id = ?');       params.push(filters.entityId); }
    if (filters.from)           { where.push('created_at >= ?');    params.push(filters.from); }
    if (filters.to)             { where.push('created_at <= ?');    params.push(filters.to); }

    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const [[{ total }]] = await pool.query<any[]>(
      `SELECT COUNT(*) AS total FROM audit_logs WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, organization_id, actor_id, actor_type, action, entity_type,
              entity_id, entity_label, before_state, after_state, metadata, created_at
       FROM audit_logs WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      [...params]
    );
    return { total: Number(total), page, pageSize, items: rows };
  }
}
