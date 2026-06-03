import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { AuditService } from '../services/AuditService.js';

export const createTimetableEntry = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { course_id, faculty_id, day_of_week, start_time, end_time, room_no, mode } = req.body;
  if (!course_id || !faculty_id || !day_of_week || !start_time || !end_time) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Missing required fields');
  }

  const [result] = await pool.execute(
    `INSERT INTO timetable (course_id, faculty_id, day_of_week, start_time, end_time, room_no, mode, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [course_id, faculty_id, day_of_week, start_time, end_time, room_no, mode, req.user!.id]
  );

  const ttId = (result as any).insertId;

  await AuditService.logFromRequest(req, {
    action: 'TIMETABLE_ASSIGN',
    entityType: 'timetable',
    entityId: ttId,
    entityLabel: `faculty=${faculty_id} ${day_of_week} ${start_time}-${end_time}`,
    afterState: { faculty_id, day_of_week, start_time, end_time, room_no }
  });

  res.status(201).json({ message: 'Timetable entry created', id: ttId });
});

export const getMyTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [rows] = await pool.execute(
    `SELECT t.*, c.code as course_code, c.title as course_title,
            fn_format_time_12hr(t.start_time) as start_time_formatted,
            fn_format_time_12hr(t.end_time) as end_time_formatted
     FROM timetable t
     LEFT JOIN courses c ON t.course_id = c.id
     WHERE t.faculty_id = ?
     ORDER BY FIELD(t.day_of_week, 'MON','TUE','WED','THU','FRI','SAT'), t.start_time`,
    [req.user!.id]
  );
  res.json(rows);
});

export const updateTimetableEntry = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { course_id, faculty_id, day_of_week, start_time, end_time, room_no, mode } = req.body;

  const [[old]] = await pool.execute<any[]>('SELECT * FROM timetable WHERE id = ?', [id]);
  if (!old) throw new AppError(404, 'NOT_FOUND', 'Timetable entry not found');

  await pool.execute(
    'UPDATE timetable SET course_id = ?, faculty_id = ?, day_of_week = ?, start_time = ?, end_time = ?, room_no = ?, mode = ? WHERE id = ?',
    [course_id, faculty_id, day_of_week, start_time, end_time, room_no, mode, id]
  );

  await AuditService.logFromRequest(req, {
    action: 'TIMETABLE_EDIT',
    entityType: 'timetable',
    entityId: Number(id),
    beforeState: old,
    afterState: req.body
  });

  res.json({ message: 'Timetable updated' });
});

export const deleteTimetableEntry = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const [[entry]] = await pool.execute<any[]>('SELECT * FROM timetable WHERE id = ?', [id]);
  if (!entry) throw new AppError(404, 'NOT_FOUND', 'Timetable entry not found');

  await pool.execute('DELETE FROM timetable WHERE id = ?', [id]);

  await AuditService.logFromRequest(req, {
    action: 'TIMETABLE_DELETE',
    entityType: 'timetable',
    entityId: Number(id),
    beforeState: entry
  });

  res.json({ message: 'Timetable entry deleted' });
});
