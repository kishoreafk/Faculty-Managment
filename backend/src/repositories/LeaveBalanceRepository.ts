import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { BaseRepository } from './BaseRepository.js';
import { LeaveBalance } from '../types/models.js';

interface LeaveBalanceRow extends RowDataPacket, LeaveBalance {}

export class LeaveBalanceRepository extends BaseRepository<LeaveBalanceRow> {
  constructor() {
    super('leave_balances');
  }

  async findByFacultyAndYear(facultyId: number, year: number = new Date().getFullYear()): Promise<LeaveBalance[]> {
    const [rows] = await pool.execute<LeaveBalanceRow[]>(
      `SELECT lb.*, lt.name, lt.code, lt.gender_restriction
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.faculty_id = ? AND lb.year = ?`,
      [facultyId, year]
    );
    return rows;
  }

  async findByFacultyAndLeaveType(facultyId: number, leaveTypeId: number, year: number = new Date().getFullYear()): Promise<LeaveBalance | null> {
    const [rows] = await pool.execute<LeaveBalanceRow[]>(
      'SELECT * FROM leave_balances WHERE faculty_id = ? AND leave_type_id = ? AND year = ? LIMIT 1',
      [facultyId, leaveTypeId, year]
    );
    return rows[0] ?? null;
  }
}

export const leaveBalanceRepository = new LeaveBalanceRepository();
