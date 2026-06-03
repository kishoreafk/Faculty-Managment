import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { AuditService } from '../services/AuditService.js';
import { RowDataPacket } from 'mysql2';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePagination } from '../utils/pagination.js';
import { formatRowDateTimes } from '../utils/timeFormat.js';
import { checkFileAccess } from '../utils/fileAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_BASE = path.join(__dirname, '../../uploads/timetables');

const parseOptionalYear = (raw: unknown): number | null => {
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return null;
  return parsed;
};

export const uploadTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const facultyId = req.user!.id;
  const { title, description, year, semester, visibility = 'PRIVATE' } = req.body;
  const file = req.file;
  if (!file) throw new AppError(400, 'NO_FILE', 'No file uploaded');
  let renamed = false;

  try {
    const uuid = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    const storedFilename = `${uuid}_v1${ext}`;
    const yearValue = parseOptionalYear(year);
    if (year !== undefined && year !== null && year !== '' && yearValue === null) {
      throw new AppError(400, 'INVALID_YEAR', 'Invalid year');
    }

    const yearDir = (yearValue ?? new Date().getFullYear()).toString();
    const facultyDir = path.join(UPLOAD_BASE, facultyId.toString(), yearDir);
    await fsp.mkdir(facultyDir, { recursive: true });

    await fsp.rename(file.path, path.join(facultyDir, storedFilename));
    renamed = true;
    const fileSizeKb = Math.round(file.size / 1024);

    const [result] = await pool.execute<any>(
      `INSERT INTO timetable_files (uploaded_by, original_filename, stored_filename, file_size_kb,
       mime_type, title, description, year, semester, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [facultyId, file.originalname, storedFilename, fileSizeKb, file.mimetype,
       title, description || null, yearValue, semester || null, visibility]
    );

    await pool.execute(
      'INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
      [result.insertId, 'UPLOAD', facultyId, req.ip || null, req.get('user-agent') || null]
    );

    res.json({ fileId: result.insertId, title, version: 1, message: 'Timetable uploaded successfully' });
  } catch (error) {
    if (file && !renamed && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch { /* ignore cleanup failures */ }
    }
    throw error;
  }
});

export const getMyTimetables = asyncHandler(async (req: AuthRequest, res: Response) => {
  const facultyId = req.user!.id;
  const { year, semester } = req.query;
  const { page, pageSize, limit, offset } = parsePagination(req.query.page, req.query.pageSize, { defaultPageSize: 20, maxPageSize: 100 });

  let whereClause = 'uploaded_by = ? AND is_active = TRUE';
  const params: any[] = [facultyId];
  if (year) { whereClause += ' AND year = ?'; params.push(year); }
  if (semester) { whereClause += ' AND semester = ?'; params.push(semester); }

  const [countResult] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM timetable_files WHERE ${whereClause}`, params
  );
  const total = Number(countResult[0]?.total ?? 0);

  const [files]: any = await pool.execute<RowDataPacket[]>(
    `SELECT id, title, description, original_filename, file_size_kb, mime_type,
            year, semester, visibility, version, is_active, created_at
     FROM timetable_files WHERE ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    [...params]
  );
  files.forEach((f: any) => formatRowDateTimes(f, ['created_at']));

  res.json({ files, total, page, pageSize });
});

export const downloadTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const [files] = await pool.execute<RowDataPacket[]>(
    `SELECT tf.*, f.department, uf.department as user_department
     FROM timetable_files tf JOIN faculty f ON tf.uploaded_by = f.id
     JOIN faculty uf ON uf.id = ? WHERE tf.id = ?`, [userId, id]
  );
  if (files.length === 0) throw new AppError(404, 'NOT_FOUND', 'File not found');

  const file = files[0];
  const access = checkFileAccess(file, userId, userRole);
  if (!access.allowed) throw new AppError(403, 'FORBIDDEN', access.reason || 'Access denied');

  const year = file.year || new Date(file.created_at).getFullYear();
  const filePath = path.join(UPLOAD_BASE, file.uploaded_by.toString(), year.toString(), file.stored_filename);
  if (!fs.existsSync(filePath)) throw new AppError(404, 'NOT_FOUND', 'File not found on disk');

  await pool.execute(
    'INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
    [id, 'DOWNLOAD', userId, req.ip || null, req.get('user-agent') || null]
  );

  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
  const readStream = fs.createReadStream(filePath);
  readStream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'File read error', code: 'FILE_READ_ERROR' });
    }
  });
  res.on('error', () => readStream.destroy());
  readStream.pipe(res);
});

export const previewTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const [files] = await pool.execute<RowDataPacket[]>(
    `SELECT tf.*, f.department, uf.department as user_department
     FROM timetable_files tf JOIN faculty f ON tf.uploaded_by = f.id
     JOIN faculty uf ON uf.id = ? WHERE tf.id = ?`, [userId, id]
  );
  if (files.length === 0) throw new AppError(404, 'NOT_FOUND', 'File not found');

  const file = files[0];
  const access = checkFileAccess(file, userId, userRole);
  if (!access.allowed) throw new AppError(403, 'FORBIDDEN', access.reason || 'Access denied');

  const year = file.year || new Date(file.created_at).getFullYear();
  const filePath = path.join(UPLOAD_BASE, file.uploaded_by.toString(), year.toString(), file.stored_filename);
  if (!fs.existsSync(filePath)) throw new AppError(404, 'NOT_FOUND', 'File not found on disk');

  if (!file.mime_type.includes('pdf') && !file.mime_type.includes('image')) {
    throw new AppError(400, 'PREVIEW_UNAVAILABLE', 'Preview not available for this file type');
  }

  await pool.execute(
    'INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
    [id, 'VIEW', userId, req.ip || null, req.get('user-agent') || null]
  );

  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${file.original_filename}"`);
  const readStream = fs.createReadStream(filePath);
  readStream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'File read error', code: 'FILE_READ_ERROR' });
    }
  });
  res.on('error', () => readStream.destroy());
  readStream.pipe(res);
});

export const adminGetAllTimetables = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { facultyId, query } = req.query;
  const { page, pageSize, limit, offset } = parsePagination(req.query.page, req.query.pageSize, { defaultPageSize: 20, maxPageSize: 100 });

  let sql = `SELECT tf.id, tf.title, tf.description, tf.original_filename, tf.file_size_kb,
                    tf.mime_type, tf.year, tf.semester, tf.visibility, tf.version, tf.created_at,
                    f.id as faculty_id, f.name as faculty_name, f.department, f.assigned_timetable_file_id
             FROM timetable_files tf JOIN faculty f ON tf.uploaded_by = f.id WHERE tf.is_active = TRUE`;
  const params: any[] = [];
  if (facultyId) { sql += ' AND tf.uploaded_by = ?'; params.push(facultyId); }
  if (query) { sql += ' AND (tf.title LIKE ? OR tf.description LIKE ? OR f.name LIKE ?)'; params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
  sql += ' ORDER BY tf.created_at DESC';

  const [countResult]: any = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM timetable_files tf JOIN faculty f ON tf.uploaded_by = f.id WHERE tf.is_active = TRUE` +
    (facultyId ? ' AND tf.uploaded_by = ?' : '') +
    (query ? ' AND (tf.title LIKE ? OR tf.description LIKE ? OR f.name LIKE ?)' : ''),
    params
  );
  const total = Number(countResult[0]?.total ?? 0);

  const [files]: any = await pool.execute<RowDataPacket[]>(sql + ` LIMIT ${limit} OFFSET ${offset}`, [...params]);
  files.forEach((f: any) => formatRowDateTimes(f, ['created_at']));
  res.json({ files, total, page, pageSize });
});

export const assignTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { facultyId, fileId } = req.body;
  if (!facultyId || !fileId) throw new AppError(400, 'VALIDATION_ERROR', 'Faculty ID and File ID are required');

  const [files] = await pool.execute<RowDataPacket[]>('SELECT * FROM timetable_files WHERE id = ?', [fileId]);
  if (files.length === 0) throw new AppError(404, 'NOT_FOUND', 'Timetable file not found');

  await pool.execute('UPDATE faculty SET assigned_timetable_file_id = ? WHERE id = ?', [fileId, facultyId]);

  await pool.execute(
    'INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent, note) VALUES (?, ?, ?, ?, ?, ?)',
    [fileId, 'ASSIGN', req.user!.id, req.ip || null, req.get('user-agent') || null, `Assigned to faculty ID ${facultyId}`]
  );

  await AuditService.logFromRequest(req, {
    action: 'ASSIGN_TIMETABLE', entityType: 'timetable_files', entityId: fileId,
    entityLabel: `Assigned to faculty ${facultyId}`, afterState: { facultyId, fileId }
  });

  res.json({ message: 'Timetable assigned successfully' });
});

export const unassignTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { facultyId } = req.body;
  if (!facultyId) throw new AppError(400, 'VALIDATION_ERROR', 'Faculty ID is required');

  const [faculty] = await pool.execute<RowDataPacket[]>('SELECT assigned_timetable_file_id FROM faculty WHERE id = ?', [facultyId]);
  if (faculty.length === 0) throw new AppError(404, 'NOT_FOUND', 'Faculty not found');

  const fileId = faculty[0].assigned_timetable_file_id;
  await pool.execute('UPDATE faculty SET assigned_timetable_file_id = NULL WHERE id = ?', [facultyId]);

  if (fileId) {
    await pool.execute(
      'INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent, note) VALUES (?, ?, ?, ?, ?, ?)',
      [fileId, 'UNASSIGN', req.user!.id, req.ip || null, req.get('user-agent') || null, `Unassigned from faculty ID ${facultyId}`]
    );
    await AuditService.logFromRequest(req, {
      action: 'UNASSIGN_TIMETABLE', entityType: 'timetable_files', entityId: fileId,
      entityLabel: `Unassigned from faculty ${facultyId}`, afterState: { facultyId, fileId }
    });
  }

  res.json({ message: 'Timetable unassigned successfully' });
});

export const deleteTimetableFile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const [files] = await pool.execute<RowDataPacket[]>('SELECT * FROM timetable_files WHERE id = ?', [id]);
  if (files.length === 0) throw new AppError(404, 'NOT_FOUND', 'File not found');

  const file = files[0];
  const isOwner = file.uploaded_by === userId;
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
  if (!isOwner && !isAdmin) throw new AppError(403, 'FORBIDDEN', 'Access denied');

  const year = file.year || new Date(file.created_at).getFullYear();
  const filePath = path.join(UPLOAD_BASE, file.uploaded_by.toString(), year.toString(), file.stored_filename);

  await pool.execute(
    'INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
    [id, 'DELETE', userId, req.ip || null, req.get('user-agent') || null]
  );

  await pool.execute('UPDATE faculty SET assigned_timetable_file_id = NULL WHERE assigned_timetable_file_id = ?', [id]);
  await pool.execute('DELETE FROM timetable_files WHERE id = ?', [id]);

  await AuditService.logFromRequest(req, {
    action: 'DELETE_TIMETABLE_FILE', entityType: 'timetable_files', entityId: Number(id),
    entityLabel: file.stored_filename, beforeState: { file }
  });

  try { await fsp.unlink(filePath); } catch { /* file may already be gone */ }
  res.json({ message: 'Timetable file deleted successfully' });
});

export const getAssignedTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [faculty] = await pool.execute<RowDataPacket[]>(
    `SELECT f.assigned_timetable_file_id, tf.title, tf.description, tf.original_filename,
            tf.file_size_kb, tf.mime_type, tf.year, tf.semester, tf.created_at
     FROM faculty f LEFT JOIN timetable_files tf ON f.assigned_timetable_file_id = tf.id
     WHERE f.id = ?`, [req.user!.id]
  );
  if (faculty.length === 0 || !faculty[0].assigned_timetable_file_id) {
    return res.json({ assigned: false, file: null });
  }
  formatRowDateTimes(faculty[0], ['created_at']);
  res.json({ assigned: true, file: faculty[0] });
});
