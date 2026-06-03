import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { AuditService } from '../services/AuditService.js';
import { formatRowDates, formatRowDateTimes } from '../utils/timeFormat.js';
import { sendAccountApprovedEmail } from '../utils/emailTemplates.js';

export const getPendingFaculty = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Math.abs(Number(req.query.pageSize)) || 200, 1000);
  const offset = Math.max(Math.abs(Number(req.query.page)) - 1 || 0, 0) * limit;
  const [rows]: any = await pool.execute(
    `SELECT f.*, ft.name as faculty_type_name
     FROM faculty f
     JOIN faculty_types ft ON f.faculty_type_id = ft.id
     WHERE f.approved = FALSE AND f.active = TRUE
      ORDER BY f.created_at ASC LIMIT ${limit} OFFSET ${offset}`
  );
  rows.forEach((row: any) => {
    formatRowDates(row, ['doj']);
    formatRowDateTimes(row, ['created_at', 'updated_at']);
  });
  res.json(rows);
});

export const approveFaculty = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [facultyRows]: any = await connection.execute(
      'SELECT email, name, approved FROM faculty WHERE id = ? FOR UPDATE', [id]
    );
    if (facultyRows.length === 0) throw new AppError(404, 'NOT_FOUND', 'User not found');
    if (facultyRows[0].approved) throw new AppError(400, 'ALREADY_APPROVED', 'User already approved');

    let role_id: number;
    if (role) {
      const [roleResult]: any = await connection.execute('SELECT id FROM roles WHERE name = ?', [role]);
      if (roleResult.length > 0) {
        role_id = roleResult[0].id;
      } else {
        const [fallback]: any = await connection.execute('SELECT id FROM roles WHERE name = ?', ['FACULTY']);
        role_id = fallback[0]?.id ?? 4;
      }
    } else {
      const [fallback]: any = await connection.execute('SELECT id FROM roles WHERE name = ?', ['FACULTY']);
      role_id = fallback[0]?.id ?? 4;
    }

    await connection.execute('UPDATE faculty SET approved = TRUE, role_id = ? WHERE id = ?', [role_id, id]);
    try { await connection.query('CALL sp_assign_default_leaves(?)', [id]); } catch (spErr: any) {
      console.warn(`sp_assign_default_leaves failed for approved user ${id}:`, spErr.message);
    }
    await connection.commit();

    await AuditService.logFromRequest(req, {
      action: 'FACULTY_APPROVE',
      entityType: 'faculty',
      entityId: Number(id),
      afterState: { approved: true, role_id }
    });

    if (facultyRows[0].email) {
      await sendAccountApprovedEmail({ name: facultyRows[0].name, email: facultyRows[0].email });
    }
    res.json({ message: 'Faculty approved and leave balances initialized' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const rejectFaculty = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE faculty SET active = FALSE WHERE id = ?', [id]);
    await connection.commit();

    await AuditService.logFromRequest(req, {
      action: 'FACULTY_REJECT',
      entityType: 'faculty',
      entityId: Number(id),
      afterState: { approved: false },
      reason: reason || 'Registration rejected'
    });
    res.json({ message: 'Faculty registration rejected' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const getAllFaculty = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Math.abs(Number(req.query.pageSize)) || 500, 2000);
  const offset = Math.max(Math.abs(Number(req.query.page)) - 1 || 0, 0) * limit;
  const [rows]: any = await pool.execute(
    `SELECT f.*, ft.name as faculty_type_name, r.name as role_name
     FROM faculty f
     JOIN faculty_types ft ON f.faculty_type_id = ft.id
     JOIN roles r ON f.role_id = r.id
     WHERE f.active = TRUE
      ORDER BY f.name LIMIT ${limit} OFFSET ${offset}`
  );
  rows.forEach((row: any) => {
    formatRowDates(row, ['doj']);
    formatRowDateTimes(row, ['created_at', 'updated_at', 'last_login']);
  });
  res.json(rows);
});
