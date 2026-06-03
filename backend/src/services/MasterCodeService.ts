import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Read-only view over the unified `master_codes` table.
 *
 * The application is gradually moving away from MySQL ENUMs and hardcoded
 * role/status strings. This service is the single source of truth for
 * "what codes are valid for category X".
 */
export interface MasterCode {
  id: number;
  category: string;
  code: string;
  name: string | null;
  display_order: number;
  active: boolean;
  created_at: Date;
}

export class MasterCodeService {
  /**
   * List active codes for a given category, ordered by display_order.
   * Used by the frontend to populate dropdowns.
   */
  static async listByCategory(category: string, includeInactive = false): Promise<MasterCode[]> {
    const where = includeInactive ? 'category = ?' : 'category = ? AND active = TRUE';
    const [rows] = await pool.execute<any[]>(
      `SELECT id, category, code, name, display_order, active, created_at
       FROM master_codes WHERE ${where}
       ORDER BY display_order, code`,
      [category]
    );
    return rows as MasterCode[];
  }

  /**
   * Look up a single code by (category, code). Returns null if not found.
   * Use this to validate form input against the master list.
   */
  static async get(category: string, code: string): Promise<MasterCode | null> {
    const [rows] = await pool.execute<any[]>(
      `SELECT id, category, code, name, display_order, active, created_at
       FROM master_codes WHERE category = ? AND code = ? LIMIT 1`,
      [category, code]
    );
    return (rows[0] as MasterCode) ?? null;
  }

  /**
   * Validate that a (category, code) pair exists and is active. Throws
   * an AppError(400) if not — useful for form/seed endpoints that want
   * to fail fast.
   */
  static async assertActive(category: string, code: string): Promise<MasterCode> {
    const row = await MasterCodeService.get(category, code);
    if (!row || !row.active) {
      throw new AppError(400, 'INVALID_CODE', `Invalid or inactive code: ${category}.${code}`);
    }
    return row;
  }

  /**
   * Return codes for a category as a plain `{code: name}` map. Convenient
   * for i18n-aware code lookups in the backend.
   */
  static async asMap(category: string): Promise<Record<string, string>> {
    const rows = await MasterCodeService.listByCategory(category);
    const out: Record<string, string> = {};
    for (const r of rows) out[r.code] = r.name ?? r.code;
    return out;
  }
}
