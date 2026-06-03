import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

const ALLOWED_TABLES = [
  'admin_logs', 'faculty', 'leave_applications', 'leave_balances',
  'product_requests', 'timetable', 'vault_files', 'test_table'
] as const;

export class BaseRepository<T extends RowDataPacket> {
  protected tableName: string;

  constructor(tableName: string) {
    if (!ALLOWED_TABLES.includes(tableName as any)) {
      throw new Error(`Table '${tableName}' is not in the allowed list`);
    }
    this.tableName = tableName;
  }

  async findById(id: number): Promise<T | null> {
    const [rows] = await pool.query<T[]>(
      `SELECT * FROM \`${this.tableName}\` WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async findAll(opts: { where?: string; params?: any[]; orderBy?: string; limit?: number; offset?: number } = {}): Promise<T[]> {
    let sql = `SELECT * FROM \`${this.tableName}\``;
    const params: any[] = [];
    if (opts.where) {
      sql += ` WHERE ${opts.where}`;
      params.push(...(opts.params ?? []));
    }
    if (opts.orderBy) sql += ` ORDER BY ${opts.orderBy}`;
    if (opts.limit) {
      sql += ` LIMIT ?`;
      params.push(opts.limit);
    }
    if (opts.offset) {
      sql += ` OFFSET ?`;
      params.push(opts.offset);
    }
    const [rows] = await pool.query<T[]>(sql, params);
    return rows;
  }

  async count(opts: { where?: string; params?: any[] } = {}): Promise<number> {
    let sql = `SELECT COUNT(*) AS total FROM \`${this.tableName}\``;
    const params: any[] = [];
    if (opts.where) {
      sql += ` WHERE ${opts.where}`;
      params.push(...(opts.params ?? []));
    }
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return Number(rows[0]?.total ?? 0);
  }

  async create(data: Record<string, any>): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO \`${this.tableName}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders})`,
      values
    );
    return result.insertId;
  }

  async update(id: number, data: Record<string, any>): Promise<boolean> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(k => `\`${k}\` = ?`).join(', ');
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE \`${this.tableName}\` SET ${setClause} WHERE id = ?`,
      [...values, id]
    );
    return result.affectedRows > 0;
  }

  async delete(id: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM \`${this.tableName}\` WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }

  async softDelete(id: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE \`${this.tableName}\` SET deleted = TRUE, deleted_at = NOW() WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }

  async exists(id: number): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM \`${this.tableName}\` WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows.length > 0;
  }
}
