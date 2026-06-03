import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { formatRowDates, formatRowDateTimes } from '../utils/timeFormat.js';

export const getDashboardSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const facultyId = req.user!.id;
  const role = req.user!.role;

  const [leaveBalances] = await pool.execute(
    `SELECT lb.leave_type_id, lt.code, lt.name, lb.year, lb.balance, lb.reserved,
            (lb.balance - lb.reserved) AS available
     FROM leave_balances lb
     JOIN leave_types lt ON lt.id = lb.leave_type_id
     WHERE lb.faculty_id = ? AND lb.year = YEAR(CURDATE())`,
    [facultyId]
  );

  let productCount: any = { count: 0 };
  let leaveCount: any = { count: 0 };
  let facultyCount: any = { count: 0 };

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    [[productCount]] = await pool.execute("SELECT COUNT(*) as count FROM product_requests WHERE status = 'PENDING'") as any;
    [[leaveCount]] = await pool.execute("SELECT COUNT(*) as count FROM leave_applications WHERE status = 'PENDING'") as any;
    [[facultyCount]] = await pool.execute("SELECT COUNT(*) as count FROM faculty WHERE approved = FALSE AND active = TRUE") as any;
  } else {
    [[productCount]] = await pool.execute("SELECT COUNT(*) as count FROM product_requests WHERE faculty_id = ? AND status = 'PENDING'", [facultyId]) as any;
    [[leaveCount]] = await pool.execute("SELECT COUNT(*) as count FROM leave_applications WHERE faculty_id = ? AND status = 'PENDING'", [facultyId]) as any;
  }

  res.json({
    facultyId,
    leaveBalances,
    pendingProductRequestsCount: productCount.count,
    pendingLeaveCount: leaveCount.count,
    pendingFacultyCount: facultyCount.count
  });
});

export const getNotificationCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const role = req.user!.role;
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    const [[pendingLeaves]] = await pool.execute("SELECT COUNT(*) as count FROM leave_applications WHERE status = 'PENDING'") as any;
    const [[pendingProducts]] = await pool.execute("SELECT COUNT(*) as count FROM product_requests WHERE status = 'PENDING'") as any;
    const [[pendingFaculty]] = await pool.execute("SELECT COUNT(*) as count FROM faculty WHERE approved = FALSE AND active = TRUE") as any;
    res.json({
      total: pendingLeaves.count + pendingProducts.count + pendingFaculty.count,
      pendingLeaves: pendingLeaves.count,
      pendingProducts: pendingProducts.count,
      pendingFaculty: pendingFaculty.count
    });
  } else {
    res.json({ total: 0 });
  }
});

export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const role = req.user!.role;
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    const [leaves] = await pool.execute<any[]>(
      `SELECT la.id, la.faculty_id, f.name as faculty_name, la.leave_type_id, lt.name as leave_type,
              la.start_date, la.end_date, la.total_days, la.created_at, 'LEAVE' as type
       FROM leave_applications la
       JOIN faculty f ON la.faculty_id = f.id
       JOIN leave_types lt ON la.leave_type_id = lt.id
       WHERE la.status = 'PENDING'
       ORDER BY la.created_at DESC LIMIT 50`
    );
    const [products] = await pool.execute<any[]>(
      `SELECT pr.id, pr.faculty_id, f.name as faculty_name, pr.item_name, pr.quantity,
              pr.reason, pr.created_at, 'PRODUCT' as type
       FROM product_requests pr
       JOIN faculty f ON pr.faculty_id = f.id
       WHERE pr.status = 'PENDING'
       ORDER BY pr.created_at DESC LIMIT 50`
    );
    const [faculty] = await pool.execute<any[]>(
      `SELECT f.id, f.name as faculty_name, f.email, f.department, ft.name as faculty_type,
              f.created_at, 'USER' as type
       FROM faculty f
       JOIN faculty_types ft ON f.faculty_type_id = ft.id
       WHERE f.approved = FALSE AND f.active = TRUE
       ORDER BY f.created_at ASC LIMIT 50`
    );
    const notifications = [...leaves, ...products, ...faculty].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    notifications.forEach((n: any) => {
      formatRowDates(n, ['start_date', 'end_date']);
      formatRowDateTimes(n, ['created_at']);
    });
    res.json({ notifications, total: notifications.length });
  } else {
    res.json({ notifications: [], total: 0 });
  }
});
