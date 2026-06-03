import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';
import { BaseRepository } from './BaseRepository.js';
import { ProductRequest } from '../types/models.js';

interface ProductRequestRow extends RowDataPacket, ProductRequest {}

export class ProductRequestRepository extends BaseRepository<ProductRequestRow> {
  constructor() {
    super('product_requests');
  }

  async findByFaculty(facultyId: number, limit = 200, offset = 0): Promise<any[]> {
    const [rows] = await pool.execute<any[]>(
      `SELECT pr.*, f.name as admin_name
       FROM product_requests pr
       LEFT JOIN faculty f ON pr.admin_id = f.id
       WHERE pr.faculty_id = ? AND pr.status != 'DELETED'
       ORDER BY pr.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [facultyId]
    );
    return rows;
  }

  async findAllWithFaculty(filters: { status?: string; limit?: number; offset?: number } = {}): Promise<any[]> {
    let sql = `SELECT pr.*, f.name as faculty_name, f.department, f.employee_id, f.designation, f.email,
                      a.name as admin_name
               FROM product_requests pr
               JOIN faculty f ON pr.faculty_id = f.id
               LEFT JOIN faculty a ON pr.admin_id = a.id`;
    const params: any[] = [];
    if (filters.status) {
      sql += ' WHERE pr.status = ?';
      params.push(filters.status);
    } else {
      sql += " WHERE pr.status IN ('PENDING', 'APPROVED', 'REJECTED')";
    }
    const _limit = Math.min(Math.abs(filters.limit ?? 200), 1000);
    const _offset = Math.max(filters.offset || 0, 0);
    sql += ` ORDER BY FIELD(pr.status, 'PENDING', 'APPROVED', 'REJECTED'), pr.created_at DESC LIMIT ${_limit} OFFSET ${_offset}`;
    const [rows] = await pool.execute<any[]>(sql, params);
    return rows;
  }

  async getDetails(id: number): Promise<any | null> {
    const [rows] = await pool.execute<any[]>(
      `SELECT pr.*, f.name as faculty_name, f.employee_id, f.department, f.designation, f.email,
              a.name as admin_name
       FROM product_requests pr
       JOIN faculty f ON pr.faculty_id = f.id
       LEFT JOIN faculty a ON pr.admin_id = a.id
       WHERE pr.id = ?`,
      [id]
    );
    return rows[0] ?? null;
  }

  async review(id: number, action: string, adminId: number, reason: string): Promise<void> {
    await pool.execute(
      'UPDATE product_requests SET status = ?, admin_id = ?, admin_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [action, adminId, reason, id]
    );
  }
}

export const productRequestRepository = new ProductRequestRepository();
