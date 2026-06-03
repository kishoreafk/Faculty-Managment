import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { BaseRepository } from './BaseRepository.js';
import { Faculty, FacultyJoin } from '../types/models.js';

interface FacultyRow extends RowDataPacket, Faculty {}
interface FacultyJoinRow extends RowDataPacket, FacultyJoin {}

export class FacultyRepository extends BaseRepository<FacultyRow> {
  constructor() {
    super('faculty');
  }

  async findByEmail(email: string): Promise<Faculty | null> {
    const [rows] = await pool.execute<FacultyRow[]>(
      'SELECT * FROM faculty WHERE LOWER(email) = LOWER(?) LIMIT 1',
      [email]
    );
    return rows[0] ?? null;
  }

  async findByEmployeeId(employeeId: string): Promise<Faculty | null> {
    const [rows] = await pool.execute<FacultyRow[]>(
      'SELECT * FROM faculty WHERE employee_id = ? LIMIT 1',
      [employeeId]
    );
    return rows[0] ?? null;
  }

  async findAllWithJoin(opts: {
    where?: string;
    params?: any[];
    orderBy?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ rows: FacultyJoin[]; total: number }> {
    const where = opts.where ?? '1=1';
    const params = opts.params ?? [];
    const orderBy = opts.orderBy ?? 'f.approved ASC, f.name';
    const limit = opts.limit ?? 25;
    const offset = opts.offset ?? 0;

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM faculty f JOIN roles r ON f.role_id = r.id WHERE ${where}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await pool.query<FacultyJoinRow[]>(
      `SELECT f.*, r.name as role_name, ft.name as faculty_type_name
       FROM faculty f
       JOIN roles r ON f.role_id = r.id
       JOIN faculty_types ft ON f.faculty_type_id = ft.id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    return { rows, total };
  }

  async getWithRole(id: number): Promise<FacultyJoin | null> {
    const [rows] = await pool.execute<FacultyJoinRow[]>(
      `SELECT f.*, r.name as role_name, ft.name as faculty_type_name
       FROM faculty f
       JOIN roles r ON f.role_id = r.id
       JOIN faculty_types ft ON f.faculty_type_id = ft.id
       WHERE f.id = ?`,
      [id]
    );
    return rows[0] ?? null;
  }

  async updateCredentials(id: number, passwordHash: string): Promise<boolean> {
    const [result] = await pool.execute<import('mysql2').ResultSetHeader>(
      'UPDATE faculty SET password_hash = ?, force_password_reset = FALSE WHERE id = ?',
      [passwordHash, id]
    );
    return result.affectedRows > 0;
  }

  async setForcePasswordReset(id: number): Promise<void> {
    await pool.execute('UPDATE faculty SET force_password_reset = TRUE WHERE id = ?', [id]);
  }

  async restore(id: number): Promise<void> {
    await pool.execute('UPDATE faculty SET deleted = FALSE, deleted_at = NULL WHERE id = ?', [id]);
  }
}

export const facultyRepository = new FacultyRepository();
