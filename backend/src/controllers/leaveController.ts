import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { AuditService } from '../services/AuditService.js';
import { formatRowDates, formatRowDateTimes } from '../utils/timeFormat.js';
import { sendLeaveReviewEmail } from '../utils/emailTemplates.js';

export const getLeaveBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [rows] = await pool.execute(
    `SELECT lb.*, lt.name, lt.code, lt.description,
            lr.accrual_rate, lr.accrual_period, lr.max_balance,
            (lb.balance - lb.reserved) as available
     FROM leave_balances lb
     JOIN leave_types lt ON lb.leave_type_id = lt.id
     LEFT JOIN faculty f ON lb.faculty_id = f.id
     LEFT JOIN leave_rules lr ON lr.faculty_type_id = f.faculty_type_id AND lr.leave_type_id = lt.id
     WHERE lb.faculty_id = ? AND lb.year = YEAR(CURDATE())`,
    [req.user!.id]
  );
  res.json(rows);
});

export const applyLeave = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leave_type_id, start_date, end_date, total_days, reason,
    leave_category = 'FULL_DAY', is_during_exam = false,
    contact_during_leave, remarks, attachments, adjustments = [] } = req.body;

  if (!leave_type_id || !start_date || !end_date || !total_days || !reason) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Missing required leave fields');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result]: any = await connection.execute(
      'CALL sp_apply_leave(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @leave_id, @result)',
      [req.user!.id, leave_type_id, start_date, end_date, total_days, reason,
       leave_category, is_during_exam, contact_during_leave, remarks,
       attachments ? JSON.stringify(attachments) : null]
    );

    const [rows]: any = await connection.execute('SELECT @leave_id as leave_id, @result as result');
    const { leave_id: leaveId, result: outcome } = rows[0];

    const errorMessages: Record<string, string> = {
      'SUCCESS': 'Leave application submitted successfully',
      'INSUFFICIENT_BALANCE': 'Insufficient leave balance',
      'PROBATION_PERIOD': 'You are in probation period and not eligible for this leave type',
      'MIN_SERVICE_NOT_MET': 'Minimum service period not met for this leave type',
      'GENDER_NOT_ELIGIBLE': 'This leave type is not applicable for your gender',
      'OVERLAPPING_LEAVE': 'You have overlapping leave applications'
    };

    if (outcome === 'SUCCESS' && leaveId) {
      for (const adj of adjustments) {
        await connection.execute(
          `INSERT INTO leave_adjustments (leave_application_id, adjustment_date, period, subject_code, class_section, room_no, alternate_faculty_id, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [leaveId, adj.date, adj.period, adj.subject, adj.class_section, adj.room_no, adj.alternate_faculty_id, adj.remarks]
        );
      }
      await connection.commit();
      res.json({ message: errorMessages[outcome], leave_id: leaveId });
    } else {
      await connection.rollback();
      res.status(400).json({ error: errorMessages[outcome] || 'Leave application failed' });
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const getLeaveApplications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Math.abs(Number(req.query.pageSize)) || 200, 1000);
  const offset = Math.max(Math.abs(Number(req.query.page)) - 1 || 0, 0) * limit;
  const [rows]: any = await pool.execute(
    `SELECT la.*, lt.name as leave_type, lt.code as leave_code, f.name as reviewer_name
     FROM leave_applications la
     JOIN leave_types lt ON la.leave_type_id = lt.id
     LEFT JOIN faculty f ON la.reviewer_id = f.id
     WHERE la.faculty_id = ? AND la.status != 'DELETED'
     ORDER BY la.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    [req.user!.id]
  );

  if (rows.length > 0) {
    const ids = rows.map((r: any) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const [adjustments] = await pool.execute(
      `SELECT ladj.*, f.name as alternate_faculty_name, f.designation as alternate_designation, f.email as alternate_email
       FROM leave_adjustments ladj JOIN faculty f ON ladj.alternate_faculty_id = f.id
       WHERE ladj.leave_application_id IN (${placeholders})
       ORDER BY ladj.adjustment_date, ladj.period`, ids
    );
    const adjByLeaveId: Record<number, any[]> = {};
    for (const adj of adjustments as any[]) {
      if (!adjByLeaveId[adj.leave_application_id]) adjByLeaveId[adj.leave_application_id] = [];
      adjByLeaveId[adj.leave_application_id].push(adj);
    }
    for (const row of rows) {
      row.adjustments = adjByLeaveId[row.id] || [];
    }
  }

  for (const row of rows) {
    formatRowDates(row, ['start_date', 'end_date']);
    formatRowDateTimes(row, ['created_at', 'updated_at', 'reviewed_at']);
  }
  res.json(rows);
});

export const updateLeaveStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, reason } = req.body;
  if (!reason || reason.trim() === '') throw new AppError(400, 'VALIDATION_ERROR', 'Reason is required');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[leaveInfo]]: any = await connection.execute(
      `SELECT la.id, la.start_date, la.end_date, lt.name as leave_type, f.email as faculty_email, f.name as faculty_name
       FROM leave_applications la JOIN leave_types lt ON la.leave_type_id = lt.id
       JOIN faculty f ON la.faculty_id = f.id WHERE la.id = ?`, [id]
    );

    const [[leave]]: any = await connection.execute('SELECT status FROM leave_applications WHERE id = ?', [id]);
    if (!leave || leave.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_STATE', 'Leave application not found or already processed');
    }

    await connection.execute('CALL sp_update_leave_status(?, ?, ?, ?)', [id, req.user!.id, status, reason]);
    await connection.commit();

    await AuditService.logFromRequest(req, {
      action: status === 'APPROVED' ? 'LEAVE_APPROVE' : 'LEAVE_REJECT',
      entityType: 'leave_application',
      entityId: Number(id),
      beforeState: { status: 'PENDING' },
      afterState: { status },
      reason
    });

    if (leaveInfo?.faculty_email) {
      const start = leaveInfo.start_date instanceof Date ? leaveInfo.start_date.toISOString().slice(0, 10) : String(leaveInfo.start_date);
      const end = leaveInfo.end_date instanceof Date ? leaveInfo.end_date.toISOString().slice(0, 10) : String(leaveInfo.end_date);
      await sendLeaveReviewEmail({
        email: leaveInfo.faculty_email, name: leaveInfo.faculty_name,
        leaveType: leaveInfo.leave_type, startDate: start, endDate: end, status, reason
      });
    }
    res.json({ message: `Leave ${status.toLowerCase()} successfully` });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const getPendingLeaves = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Math.abs(Number(req.query.pageSize)) || 200, 1000);
  const offset = Math.max(Math.abs(Number(req.query.page)) - 1 || 0, 0) * limit;
  const [rows]: any = await pool.execute(
    `SELECT la.*, lt.name as leave_type, lt.code as leave_code,
            f.name as faculty_name, f.department, f.designation, f.employee_id,
            ft.category as faculty_category, r.name as reviewer_name
     FROM leave_applications la
     JOIN leave_types lt ON la.leave_type_id = lt.id
     JOIN faculty f ON la.faculty_id = f.id
     JOIN faculty_types ft ON f.faculty_type_id = ft.id
     LEFT JOIN faculty r ON la.reviewer_id = r.id
     WHERE la.status IN ('PENDING', 'APPROVED', 'REJECTED')
     ORDER BY FIELD(la.status, 'PENDING', 'APPROVED', 'REJECTED'), la.created_at DESC LIMIT ${limit} OFFSET ${offset}`
  );

  if (rows.length > 0) {
    const ids = rows.map((r: any) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const [adjustments] = await pool.execute(
      `SELECT ladj.*, f.name as alternate_faculty_name, f.designation as alternate_designation,
              f.email as alternate_email, f.department as alternate_department
       FROM leave_adjustments ladj JOIN faculty f ON ladj.alternate_faculty_id = f.id
       WHERE ladj.leave_application_id IN (${placeholders})
       ORDER BY ladj.adjustment_date, ladj.period`, ids
    );
    const adjByLeaveId: Record<number, any[]> = {};
    for (const adj of adjustments as any[]) {
      if (!adjByLeaveId[adj.leave_application_id]) adjByLeaveId[adj.leave_application_id] = [];
      adjByLeaveId[adj.leave_application_id].push(adj);
    }
    for (const row of rows) {
      row.adjustments = adjByLeaveId[row.id] || [];
    }
  }

  for (const row of rows) {
    formatRowDates(row, ['start_date', 'end_date']);
    formatRowDateTimes(row, ['created_at', 'updated_at', 'reviewed_at']);
  }
  res.json(rows);
});

export const getLeaveHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [rows] = await pool.execute(
    `SELECT lah.*, lt.name as leave_type, lt.code
     FROM leave_accrual_history lah JOIN leave_types lt ON lah.leave_type_id = lt.id
     WHERE lah.faculty_id = ? ORDER BY lah.accrual_date DESC LIMIT 100`, [req.user!.id]
  );
  res.json(rows);
});

export const getLeaveEligibility = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [rows] = await pool.execute(
    'SELECT * FROM v_faculty_leave_availability WHERE faculty_id = ? AND year = YEAR(CURDATE())', [req.user!.id]
  );
  res.json(rows);
});

export const triggerMonthlyAccrual = asyncHandler(async (req: AuthRequest, res: Response) => {
  await pool.execute('CALL sp_monthly_leave_accrual()');
  await AuditService.logFromRequest(req, {
    action: 'TRIGGER_MONTHLY_ACCRUAL', entityType: 'leave_system',
    reason: 'Manual trigger of monthly leave accrual process'
  });
  res.json({ message: 'Monthly leave accrual completed successfully' });
});

export const triggerYearlyAccrual = asyncHandler(async (req: AuthRequest, res: Response) => {
  await pool.execute('CALL sp_yearly_leave_accrual()');
  await AuditService.logFromRequest(req, {
    action: 'TRIGGER_YEARLY_ACCRUAL', entityType: 'leave_system',
    reason: 'Manual trigger of yearly leave accrual process'
  });
  res.json({ message: 'Yearly leave accrual completed successfully' });
});

export const triggerCarryForward = asyncHandler(async (req: AuthRequest, res: Response) => {
  await pool.execute('CALL sp_carry_forward_leaves()');
  await AuditService.logFromRequest(req, {
    action: 'TRIGGER_CARRY_FORWARD', entityType: 'leave_system',
    reason: 'Manual trigger of leave carry forward process'
  });
  res.json({ message: 'Leave carry forward completed successfully' });
});

export const getAlternateFaculty = asyncHandler(async (req: AuthRequest, res: Response) => {
  const dept = typeof req.query.department === 'string' ? req.query.department : null;
  const limit = Math.min(Math.abs(Number(req.query.pageSize)) || 200, 1000);
  const offset = Math.max(Math.abs(Number(req.query.page)) - 1 || 0, 0) * limit;
  const [rows] = await pool.execute(
    `SELECT f.id, f.name, f.designation, f.department, f.email, ft.category
     FROM faculty f JOIN faculty_types ft ON f.faculty_type_id = ft.id
     WHERE f.active = TRUE AND f.approved = TRUE AND ft.category = 'Teaching' AND f.id != ?
     ${dept ? 'AND f.department = ?' : ''}
     ORDER BY f.department, f.name LIMIT ${limit} OFFSET ${offset}`,
    dept ? [req.user!.id, dept] : [req.user!.id]
  );
  res.json(rows);
});

export const confirmAdjustment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, remarks } = req.body;

  const [result]: any = await pool.execute(
    `UPDATE leave_adjustments SET confirmation_status = ?, remarks = ?, confirmed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND alternate_faculty_id = ?`,
    [status, remarks, id, req.user!.id]
  );
  if (result.affectedRows === 0) throw new AppError(404, 'NOT_FOUND', 'Adjustment not found or unauthorized');
  res.json({ message: `Adjustment ${status.toLowerCase()} successfully` });
});

export const getMyAdjustments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Math.abs(Number(req.query.pageSize)) || 200, 1000);
  const offset = Math.max(Math.abs(Number(req.query.page)) - 1 || 0, 0) * limit;
  const [rows]: any = await pool.execute(
    `SELECT ladj.*, la.start_date, la.end_date, la.reason, la.status as leave_status,
            f.name as applicant_name, f.department as applicant_department, f.designation as applicant_designation,
            lt.name as leave_type
     FROM leave_adjustments ladj
     JOIN leave_applications la ON ladj.leave_application_id = la.id
     JOIN faculty f ON la.faculty_id = f.id
     JOIN leave_types lt ON la.leave_type_id = lt.id
     WHERE ladj.alternate_faculty_id = ?
     ORDER BY ladj.adjustment_date DESC, ladj.confirmation_status ASC LIMIT ${limit} OFFSET ${offset}`, [req.user!.id]
  );
  rows.forEach((row: any) => {
    formatRowDates(row, ['adjustment_date', 'start_date', 'end_date']);
    formatRowDateTimes(row, ['confirmed_at']);
  });
  res.json(rows);
});

export const getLeaveDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const [[leave]]: any = await pool.execute(
    `SELECT la.*, lt.name as leave_type, lt.code as leave_code,
            f.name as faculty_name, f.employee_id, f.department, f.designation, f.email,
            ft.category as faculty_category, r.name as reviewer_name
     FROM leave_applications la
     JOIN leave_types lt ON la.leave_type_id = lt.id
     JOIN faculty f ON la.faculty_id = f.id
     JOIN faculty_types ft ON f.faculty_type_id = ft.id
     LEFT JOIN faculty r ON la.reviewer_id = r.id
     WHERE la.id = ?`, [id]
  );
  if (!leave) throw new AppError(404, 'NOT_FOUND', 'Leave application not found');

  formatRowDates(leave, ['start_date', 'end_date']);
  formatRowDateTimes(leave, ['created_at', 'updated_at', 'reviewed_at']);

  const [adjustments] = await pool.execute(
    `SELECT ladj.*, f.name as alternate_faculty_name, f.designation as alternate_designation,
            f.email as alternate_email, f.department as alternate_department
     FROM leave_adjustments ladj JOIN faculty f ON ladj.alternate_faculty_id = f.id
     WHERE ladj.leave_application_id = ? ORDER BY ladj.adjustment_date, ladj.period`, [id]
  );
  leave.adjustments = adjustments;
  res.json(leave);
});

export const deleteLeaveApplication = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[leave]]: any = await connection.execute(
      'SELECT faculty_id, leave_type_id, total_days, status FROM leave_applications WHERE id = ? FOR UPDATE', [id]
    );
    if (!leave) throw new AppError(404, 'NOT_FOUND', 'Leave application not found');
    if (leave.faculty_id !== req.user!.id) throw new AppError(403, 'FORBIDDEN', 'Unauthorized');
    if (leave.status !== 'PENDING') throw new AppError(400, 'INVALID_STATE', 'Only pending applications can be deleted');

    await connection.execute("UPDATE leave_applications SET status = 'DELETED', deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    await connection.execute(
      'UPDATE leave_balances SET reserved = reserved - ? WHERE faculty_id = ? AND leave_type_id = ? AND year = YEAR(CURDATE())',
      [leave.total_days, leave.faculty_id, leave.leave_type_id]
    );

    await connection.commit();
    res.json({ message: 'Leave application deleted successfully' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const updateFacultyLeaveBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { faculty_id, leave_type_id, new_balance, reason } = req.body;
  const adjReason = (reason || 'Manual adjustment by admin').trim();

  const [[faculty]]: any = await pool.execute('SELECT id, name FROM faculty WHERE id = ? AND active = TRUE', [faculty_id]);
  if (!faculty) throw new AppError(404, 'NOT_FOUND', 'Faculty not found');

  const [[leaveType]]: any = await pool.execute('SELECT id, name FROM leave_types WHERE id = ?', [leave_type_id]);
  if (!leaveType) throw new AppError(404, 'NOT_FOUND', 'Leave type not found');

  await pool.execute('CALL sp_admin_update_leave_balance(?, ?, ?, ?, ?)', [faculty_id, leave_type_id, new_balance, req.user!.id, adjReason]);

  await AuditService.logFromRequest(req, {
    action: 'LEAVE_BALANCE_UPDATE', entityType: 'leave_balance',
    entityLabel: `faculty=${faculty_id} type=${leave_type_id} balance=${new_balance}`,
    afterState: { faculty_id, leave_type_id, new_balance, reason: adjReason }
  });

  res.json({ message: 'Leave balance updated successfully' });
});

export const getFacultyLeaveBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { facultyId } = req.params;
  const [rows] = await pool.execute(
    `SELECT lt.id as leave_type_id, lt.name, lt.code, lt.description,
            COALESCE(lb.balance, 0) as balance,
            COALESCE(lb.reserved, 0) as reserved,
            COALESCE(lb.balance, 0) - COALESCE(lb.reserved, 0) as available,
            lb.year, lb.last_updated, lb.id as balance_id,
            lr.accrual_rate, lr.accrual_period, lr.max_balance
     FROM leave_types lt
     LEFT JOIN leave_balances lb ON lb.leave_type_id = lt.id AND lb.faculty_id = ? AND lb.year = YEAR(CURDATE())
     LEFT JOIN leave_rules lr ON lr.faculty_type_id = (SELECT faculty_type_id FROM faculty WHERE id = ?) AND lr.leave_type_id = lt.id
     WHERE lt.active = TRUE
     ORDER BY lt.id`, [facultyId, facultyId]
  );
  res.json(rows);
});
