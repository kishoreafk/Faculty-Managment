import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { AuditService } from '../services/AuditService.js';
import { formatRowDates, formatRowDateTimes } from '../utils/timeFormat.js';
import { sendLeaveReviewEmail, sendProductReviewEmail } from '../utils/emailTemplates.js';

export const getPendingLeave = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Math.abs(Number(req.query.pageSize)) || 200, 1000);
  const offset = Math.max(Math.abs(Number(req.query.page)) - 1 || 0, 0) * limit;
  const [rows]: any = await pool.execute(
    `SELECT la.*, f.name as faculty_name, f.department, f.email, lt.name as leave_type, lt.code
     FROM leave_applications la
     JOIN faculty f ON la.faculty_id = f.id
     JOIN leave_types lt ON la.leave_type_id = lt.id
     WHERE la.status = 'PENDING'
      ORDER BY la.created_at ASC LIMIT ${limit} OFFSET ${offset}`
  );
  rows.forEach((row: any) => {
    formatRowDates(row, ['start_date', 'end_date']);
    formatRowDateTimes(row, ['created_at', 'updated_at']);
  });
  res.json(rows);
});

export const getPendingProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Math.abs(Number(req.query.pageSize)) || 200, 1000);
  const offset = Math.max(Math.abs(Number(req.query.page)) - 1 || 0, 0) * limit;
  const [rows]: any = await pool.execute(
    `SELECT pr.*, f.name as faculty_name, f.department, f.email
     FROM product_requests pr
     JOIN faculty f ON pr.faculty_id = f.id
     WHERE pr.status = 'PENDING'
      ORDER BY pr.created_at ASC LIMIT ${limit} OFFSET ${offset}`
  );
  rows.forEach((row: any) => formatRowDateTimes(row, ['created_at', 'updated_at']));
  res.json(rows);
});

export const reviewLeave = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { action, reason } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute('CALL sp_update_leave_status(?, ?, ?, ?)', [id, req.user!.id, action, reason || '']);
    await connection.commit();

    await AuditService.logFromRequest(req, {
      action: action === 'APPROVED' ? 'LEAVE_APPROVE' : 'LEAVE_REJECT',
      entityType: 'leave_application',
      entityId: Number(id),
      afterState: { status: action, reason }
    });

    const [[leave]]: any = await pool.execute(
      'SELECT la.*, f.name as faculty_name, f.email as faculty_email, lt.name as leave_type FROM leave_applications la JOIN leave_types lt ON la.leave_type_id = lt.id JOIN faculty f ON la.faculty_id = f.id WHERE la.id = ?',
      [id]
    );
    if (leave?.faculty_email) {
      const start = leave.start_date instanceof Date ? leave.start_date.toISOString().slice(0, 10) : String(leave.start_date || '');
      const end = leave.end_date instanceof Date ? leave.end_date.toISOString().slice(0, 10) : String(leave.end_date || '');
      res.json({ message: `Leave ${action.toLowerCase()} successfully` });
      sendLeaveReviewEmail({
        email: leave.faculty_email, name: leave.faculty_name,
        leaveType: leave.leave_type || 'Leave',
        startDate: start, endDate: end,
        status: action, reason: reason || ''
      }).catch(() => {});
    } else {
      res.json({ message: `Leave ${action.toLowerCase()} successfully` });
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const reviewProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { action, reason } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      'UPDATE product_requests SET status = ?, admin_id = ?, admin_reason = ? WHERE id = ?',
      [action, req.user!.id, reason || '', id]
    );
    await connection.commit();

    await AuditService.logFromRequest(req, {
      action: action === 'APPROVED' ? 'PRODUCT_APPROVE' : 'PRODUCT_REJECT',
      entityType: 'product_request',
      entityId: Number(id),
      afterState: { status: action, reason }
    });

    const [[request]]: any = await pool.execute(
      'SELECT pr.*, f.name as faculty_name, f.email as faculty_email FROM product_requests pr JOIN faculty f ON pr.faculty_id = f.id WHERE pr.id = ?',
      [id]
    );
    res.json({ message: `Product request ${action.toLowerCase()} successfully` });
    if (request?.faculty_email) {
      sendProductReviewEmail({
        email: request.faculty_email,
        name: request.faculty_name,
        itemName: request.item_name || 'Item',
        quantity: request.quantity || 0,
        reason: request.reason || '',
        status: action,
        reviewerNote: reason || ''
      }).catch(() => {});
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
