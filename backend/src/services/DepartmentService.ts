import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';

/**
 * Department management service.
 *
 * Departments were previously free-text VARCHAR(100) on the `faculty`
 * table. This service is the new authoritative source, while the legacy
 * column is kept for backward compatibility. New writes populate both
 * `department_id` AND `department`.
 */
export interface Department {
  id: number;
  organization_id: number;
  code: string;
  name: string;
  active: boolean;
  created_at: Date;
}

export class DepartmentService {
  static async list(organizationId = 1, includeInactive = false): Promise<Department[]> {
    const where = includeInactive
      ? 'organization_id = ?'
      : 'organization_id = ? AND active = TRUE';
    const [rows] = await pool.execute<any[]>(
      `SELECT id, organization_id, code, name, active, created_at
       FROM departments WHERE ${where} ORDER BY name`,
      [organizationId]
    );
    return rows as Department[];
  }

  static async getById(id: number): Promise<Department | null> {
    const [rows] = await pool.execute<any[]>(
      `SELECT id, organization_id, code, name, active, created_at
       FROM departments WHERE id = ? LIMIT 1`,
      [id]
    );
    return (rows[0] as Department) ?? null;
  }

  static async getByCode(code: string, organizationId = 1): Promise<Department | null> {
    const [rows] = await pool.execute<any[]>(
      `SELECT id, organization_id, code, name, active, created_at
       FROM departments WHERE code = ? AND organization_id = ? LIMIT 1`,
      [code, organizationId]
    );
    return (rows[0] as Department) ?? null;
  }

  /**
   * Resolve a department input to an id. Accepts either:
   *   - a numeric id (returned as-is, after validation)
   *   - a string code (looked up in `departments.code`)
   *   - a string name (looked up in `departments.name` for the org)
   * Returns null if nothing matches.
   */
  static async resolveId(input: unknown, organizationId = 1): Promise<number | null> {
    if (input === null || input === undefined || input === '') return null;
    if (typeof input === 'number' && Number.isInteger(input)) {
      const d = await DepartmentService.getById(input);
      return d?.id ?? null;
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) return null;
      // numeric-as-string?
      if (/^\d+$/.test(trimmed)) {
        const d = await DepartmentService.getById(Number(trimmed));
        if (d) return d.id;
      }
      // try by code first
      const byCode = await DepartmentService.getByCode(trimmed.toUpperCase(), organizationId);
      if (byCode) return byCode.id;
      // then by exact name
      const [rows] = await pool.execute<any[]>(
        `SELECT id FROM departments
         WHERE organization_id = ? AND name = ? LIMIT 1`,
        [organizationId, trimmed]
      );
      if (rows[0]) return Number(rows[0].id);
    }
    return null;
  }

  /**
   * Create a department. Idempotent on (organization_id, code).
   * Also mirrors the name into the legacy free-text column on existing
   * faculty rows whose `department_id` ends up matching.
   */
  static async create(input: { code: string; name: string; organizationId?: number }): Promise<Department> {
    const code = (input.code || '').trim().toUpperCase();
    const name = (input.name || '').trim();
    const organizationId = input.organizationId ?? 1;
    if (!code || !name) {
      throw new AppError(400, 'VALIDATION_ERROR', 'code and name are required');
    }
    const existing = await DepartmentService.getByCode(code, organizationId);
    if (existing) {
      throw new AppError(409, 'CODE_TAKEN', `Department code "${code}" already exists`);
    }
    const [result]: any = await pool.execute<any[]>(
      `INSERT INTO departments (organization_id, code, name, active) VALUES (?, ?, ?, TRUE)`,
      [organizationId, code, name]
    );
    return (await DepartmentService.getById(result.insertId))!;
  }

  /**
   * Mark a department inactive (soft delete). Faculty rows pointing at
   * it keep their `department_id` but the lookup APIs no longer return it.
   */
  static async deactivate(id: number, req?: AuthRequest): Promise<Department> {
    const dept = await DepartmentService.getById(id);
    if (!dept) throw new AppError(404, 'NOT_FOUND', 'Department not found');
    await pool.execute(`UPDATE departments SET active = FALSE WHERE id = ?`, [id]);
    return (await DepartmentService.getById(id))!;
  }
}
