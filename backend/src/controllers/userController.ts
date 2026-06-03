import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { facultyRepository } from '../repositories/FacultyRepository.js';
import { leaveBalanceRepository } from '../repositories/LeaveBalanceRepository.js';
import { UserService } from '../services/UserService.js';
import { LeaveDiagnosticService } from '../services/LeaveDiagnosticService.js';
import { AuditService } from '../services/AuditService.js';
import { parsePagination } from '../utils/pagination.js';
import { formatRowDates, formatRowDateTimes } from '../utils/timeFormat.js';
import { ROLES } from '../constants/index.js';

export const getAllUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const queryText = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : 'active';
  const role = typeof req.query.role === 'string' ? req.query.role : '';
  const department = typeof req.query.department === 'string' ? req.query.department : '';
  const { page, pageSize, limit, offset } = parsePagination(req.query.page, req.query.pageSize, {
    defaultPageSize: 25, maxPageSize: 100
  });

  let whereClause = '1=1';
  const params: any[] = [];

  if (status === 'active') whereClause += ' AND f.deleted = FALSE AND f.active = TRUE';
  else if (status === 'deleted') whereClause += ' AND f.deleted = TRUE';
  else if (status === 'inactive') whereClause += ' AND f.active = FALSE AND f.deleted = FALSE';

  if (queryText) {
    whereClause += ' AND (f.name LIKE ? OR f.email LIKE ? OR f.employee_id LIKE ?)';
    params.push(`%${queryText}%`, `%${queryText}%`, `%${queryText}%`);
  }
  if (role) { whereClause += ' AND r.name = ?'; params.push(role); }
  if (department) { whereClause += ' AND f.department = ?'; params.push(department); }

  const { rows, total } = await facultyRepository.findAllWithJoin({
    where: whereClause, params, orderBy: 'f.approved ASC, f.name', limit, offset
  });

  if (rows.length > 0) {
    const ids = rows.map((r: any) => r.id);
    const placeholders = ids.map(() => '?').join(',');

    const [leaveCounts] = await pool.execute<any[]>(
      `SELECT faculty_id, COUNT(*) as count FROM leave_applications
       WHERE faculty_id IN (${placeholders}) AND status = 'PENDING' GROUP BY faculty_id`, ids
    );
    const [productCounts] = await pool.execute<any[]>(
      `SELECT faculty_id, COUNT(*) as count FROM product_requests
       WHERE faculty_id IN (${placeholders}) AND status = 'PENDING' GROUP BY faculty_id`, ids
    );

    const leaveMap: Record<number, number> = {};
    for (const lc of leaveCounts) leaveMap[lc.faculty_id] = Number(lc.count);
    const productMap: Record<number, number> = {};
    for (const pc of productCounts) productMap[pc.faculty_id] = Number(pc.count);

    for (const row of rows) {
      formatRowDates(row, ['doj']);
      formatRowDateTimes(row, ['created_at', 'updated_at', 'last_login', 'deleted_at']);
      (row as any).pending_leave_count = leaveMap[row.id] || 0;
      (row as any).pending_product_count = productMap[row.id] || 0;
    }
  }

  res.json({ total, page, pageSize, items: rows });
});

export const getUserById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const user = await facultyRepository.getWithRole(Number(id));
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

  const balances = await leaveBalanceRepository.findByFacultyAndYear(Number(id));
  const [[pendingLeave]] = await pool.execute<any[]>(
    "SELECT la.*, lt.name as leave_type FROM leave_applications la JOIN leave_types lt ON la.leave_type_id = lt.id WHERE la.faculty_id = ? AND la.status = 'PENDING'", [id]
  );
  const [[pendingProducts]] = await pool.execute<any[]>(
    "SELECT * FROM product_requests WHERE faculty_id = ? AND status = 'PENDING'", [id]
  );

  const diagnostics = await LeaveDiagnosticService.computeForFaculty(Number(id));

  formatRowDates(user, ['doj']);
  formatRowDateTimes(user, ['created_at', 'updated_at', 'last_login', 'deleted_at']);

  res.json({
    ...user,
    leave_balances: balances,
    leave_diagnostics: diagnostics,
    pending_leave: pendingLeave,
    pending_products: pendingProducts
  });
});

export const createUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const requestedRoleName = String(req.body.role || 'FACULTY').toUpperCase();
  if (requestedRoleName === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Only a SUPER_ADMIN can create a SUPER_ADMIN account.');
  }

  const result = await UserService.createUser(req, req.body);
  res.status(201).json({
    message: result.diagnostic && result.diagnostic !== 'OK' && result.diagnostic !== null
      ? 'User created, but leave balances could not be fully assigned.'
      : 'User created successfully',
    id: result.id,
    diagnostic: result.diagnostic
  });
});

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { role, ...data } = req.body;

  if (role) {
    const [roleRows]: any = await pool.execute('SELECT id, name FROM roles WHERE name = ?', [role]);
    if (roleRows.length === 0) throw new AppError(400, 'INVALID_ROLE', `Invalid role: ${role}`);
    const requestedRoleName = roleRows[0].name;

    const user = await facultyRepository.findById(Number(id));
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
    const [prevRole]: any = await pool.execute('SELECT name FROM roles WHERE id = ?', [user.role_id]);
    const previousRoleName = prevRole[0]?.name ?? '';

    if ((requestedRoleName === 'SUPER_ADMIN' && previousRoleName !== 'SUPER_ADMIN') ||
        (requestedRoleName !== 'SUPER_ADMIN' && previousRoleName === 'SUPER_ADMIN')) {
      if (req.user?.role !== 'SUPER_ADMIN') {
        await AuditService.logFromRequest(req, {
          action: 'DENIED_ROLE_ESCALATION', entityType: 'faculty', entityId: Number(id),
          entityLabel: `Attempted ${previousRoleName} → ${requestedRoleName}`,
          afterState: { denied: true }
        });
        throw new AppError(403, 'FORBIDDEN', 'Only a SUPER_ADMIN can change SUPER_ADMIN membership.');
      }
    }
    data.role_id = roleRows[0].id;
  }

  const updated = await UserService.updateUser(req, Number(id), data);
  res.json({ message: 'User updated successfully', user: updated });
});

export const updateCredentials = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { password, forceReset, reason } = req.body;
  const user = await facultyRepository.findById(Number(id));
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

  if (password) {
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);
    await facultyRepository.updateCredentials(Number(id), passwordHash);
  } else if (forceReset) {
    await facultyRepository.setForcePasswordReset(Number(id));
  }

  await pool.execute('UPDATE auth_tokens SET revoked = TRUE, revoked_at = NOW() WHERE faculty_id = ?', [id]);
  await AuditService.logFromRequest(req, {
    action: 'CHANGE_CREDENTIALS', entityType: 'faculty', entityId: Number(id),
    entityLabel: user.email, reason: reason || 'Password reset by admin'
  });

  res.json({ message: 'Credentials updated and user logged out' });
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await UserService.deleteUser(Number(id), req);
  await pool.execute('UPDATE auth_tokens SET revoked = TRUE, revoked_at = NOW() WHERE faculty_id = ?', [id]);
  res.json({ message: 'User deleted successfully' });
});

export const restoreUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await UserService.restoreUser(Number(id), req);
  res.json({ message: 'User restored successfully' });
});

export const promoteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;

  const [roleResult]: any = await pool.execute('SELECT id FROM roles WHERE name = ?', [role]);
  if (roleResult.length === 0) throw new AppError(400, 'INVALID_ROLE', 'Invalid role');

  if (role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Only SUPER_ADMIN can promote to SUPER_ADMIN');
  }

  const updated = await UserService.promoteUser(Number(id), roleResult[0].id, req);
  res.json({ message: 'User role updated successfully', user: updated });
});

export const forceLogout = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await UserService.forceLogout(Number(id), req);
  res.json({ message: 'User sessions revoked successfully' });
});

export const bulkDelete = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { ids, reason } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) throw new AppError(400, 'INVALID_INPUT', 'Invalid ids array');

  const succeeded = await UserService.bulkDelete(ids, req);
  for (const id of ids) {
    await pool.execute('UPDATE auth_tokens SET revoked = TRUE, revoked_at = NOW() WHERE faculty_id = ?', [id]);
  }

  res.json({ message: `Bulk delete completed: ${succeeded} users deleted`, succeeded, failed: ids.length - succeeded });
});

export const bulkApprove = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) throw new AppError(400, 'INVALID_INPUT', 'Invalid ids array');

  let succeeded = 0;
  for (const id of ids) {
    try {
      await UserService.approveUser(id, req);
      succeeded++;
    } catch { /* individual failure tracked */ }
  }

  res.json({ message: `Bulk approval completed: ${succeeded} approved`, succeeded, failed: ids.length - succeeded });
});

export const approveUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await UserService.approveUser(Number(id), req);
  res.json({ message: 'User approved successfully' });
});

export const rejectUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users]: any = await connection.execute('SELECT approved, email, name FROM faculty WHERE id = ? FOR UPDATE', [id]);
    if (users.length === 0) throw new AppError(404, 'NOT_FOUND', 'User not found');
    if (users[0].approved) throw new AppError(400, 'ALREADY_APPROVED', 'Cannot reject already approved user');
    await connection.execute('CALL sp_permanent_delete_user(?, ?, ?)', [id, req.user!.id, reason || 'Registration rejected']);
    await connection.commit();
    res.json({ message: 'User registration rejected and removed' });
  } finally {
    connection.release();
  }
});

export const reassignLeaves = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const [users]: any = await pool.execute('SELECT id, faculty_type_id, doj, gender FROM faculty WHERE id = ?', [id]);
  if (users.length === 0) throw new AppError(404, 'NOT_FOUND', 'User not found');

  const { parseSpDiagnostic, spUnknownDiagnostic } = await import('../utils/spDiagnostics.js');
  const spResult: any = await pool.query('CALL sp_assign_default_leaves(?)', [id]);
  const diagnostic = parseSpDiagnostic(spResult) || spUnknownDiagnostic();

  await AuditService.logFromRequest(req, {
    action: 'REASSIGN_LEAVES', entityType: 'faculty', entityId: Number(id),
    afterState: diagnostic
  });

  res.json({
    message: diagnostic?.status === 'OK' ? 'Leave balances reassigned successfully.' : `Completed with status: ${diagnostic?.status}`,
    diagnostic
  });
});

export const permanentDelete = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users]: any = await connection.execute('SELECT name, email FROM faculty WHERE id = ?', [id]);
    if (users.length === 0) throw new AppError(404, 'NOT_FOUND', 'User not found');
    await connection.execute('CALL sp_permanent_delete_user(?, ?, ?)', [id, req.user!.id, reason || '']);
    await connection.commit();
    res.json({ message: 'User permanently deleted', user: users[0] });
  } finally {
    connection.release();
  }
});

export const bulkPermanentDelete = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { ids, reason } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) throw new AppError(400, 'INVALID_INPUT', 'Invalid ids array');

  const purgeAfter = new Date();
  purgeAfter.setFullYear(purgeAfter.getFullYear() + 7);
  let succeeded = 0;

  for (const id of ids) {
    const [users]: any = await pool.execute('SELECT name, email FROM faculty WHERE id = ?', [id]);
    if (users.length > 0) {
      await pool.execute(
        'UPDATE faculty SET deleted = TRUE, deleted_at = NOW(), active = FALSE WHERE id = ?', [id]
      );
      await pool.execute('UPDATE auth_tokens SET revoked = TRUE, revoked_at = NOW() WHERE faculty_id = ?', [id]);
      succeeded++;
    }
  }

  await AuditService.logFromRequest(req, {
    action: 'BULK_PERMANENT_DELETE', entityType: 'faculty', entityLabel: `${ids.length} users`,
    afterState: { succeeded, purgeAfter }
  });

  res.json({ message: 'Bulk soft-delete completed.', succeeded, failed: ids.length - succeeded, marked_for_purge_after: purgeAfter });
});
