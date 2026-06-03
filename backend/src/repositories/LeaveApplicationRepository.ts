import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';
import { BaseRepository } from './BaseRepository.js';
import { LeaveApplication } from '../types/models.js';

interface LeaveApplicationRow extends RowDataPacket, LeaveApplication {}

export class LeaveApplicationRepository extends BaseRepository<LeaveApplicationRow> {
  constructor() {
    super('leave_applications');
  }

  async findByFaculty(facultyId: number, statusFilter?: string): Promise<LeaveApplication[]> {
    let sql = 'SELECT la.*, lt.name as leave_type, lt.code as leave_code, f.name as reviewer_name FROM leave_applications la JOIN leave_types lt ON la.leave_type_id = lt.id LEFT JOIN faculty f ON la.reviewer_id = f.id WHERE la.faculty_id = ?';
    const params: any[] = [facultyId];
    if (statusFilter) {
      sql += ' AND la.status = ?';
      params.push(statusFilter);
    }
    sql += ' ORDER BY la.created_at DESC';
    const [rows] = await pool.execute<any[]>(sql, params);
    return rows;
  }

  async findPending(): Promise<any[]> {
    const [rows] = await pool.execute<any[]>(
      `SELECT la.*, lt.name as leave_type, lt.code as leave_code,
              f.name as faculty_name, f.department, f.employee_id, f.email
       FROM leave_applications la
       JOIN leave_types lt ON la.leave_type_id = lt.id
       JOIN faculty f ON la.faculty_id = f.id
       WHERE la.status = 'PENDING'
       ORDER BY la.created_at ASC`
    );
    return rows;
  }

  async updateStatus(id: number, status: string, reviewerId: number): Promise<boolean> {
    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE leave_applications SET status = ?, reviewer_id = ?, reviewed_at = NOW() WHERE id = ?",
      [status, reviewerId, id]
    );
    return result.affectedRows > 0;
  }

  async deletePending(id: number, facultyId: number): Promise<boolean> {
    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE leave_applications SET status = 'DELETED' WHERE id = ? AND faculty_id = ? AND status = 'PENDING'",
      [id, facultyId]
    );
    return result.affectedRows > 0;
  }
}

export const leaveApplicationRepository = new LeaveApplicationRepository();
