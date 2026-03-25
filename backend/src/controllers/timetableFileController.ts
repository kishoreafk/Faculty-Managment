import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePagination } from '../utils/pagination.js';
import { logAdminActionFromReq, isPrivilegedActor } from '../utils/adminLog.js';
import { formatRowDateTimes } from '../utils/timeFormat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_BASE = path.join(__dirname, '../../uploads/timetables');

if (!fs.existsSync(UPLOAD_BASE)) {
  fs.mkdirSync(UPLOAD_BASE, { recursive: true });
}

const parseOptionalYear = (raw: unknown): number | null => {
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  if (parsed < 2000 || parsed > 2100) return null;
  return parsed;
};

export const uploadTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const facultyId = req.user!.id;
    const { title, description, year, semester, visibility = 'PRIVATE' } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uuid = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    const storedFilename = `${uuid}_v1${ext}`;

    const yearValue = parseOptionalYear(year);
    if (year !== undefined && year !== null && year !== '' && yearValue === null) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    const yearDir = (yearValue ?? new Date().getFullYear()).toString();
    const facultyDir = path.join(UPLOAD_BASE, facultyId.toString(), yearDir);
    if (!fs.existsSync(facultyDir)) {
      fs.mkdirSync(facultyDir, { recursive: true });
    }

    const finalPath = path.join(facultyDir, storedFilename);
    fs.renameSync(file.path, finalPath);

    const fileSizeKb = Math.round(file.size / 1024);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO timetable_files (uploaded_by, original_filename, stored_filename, file_size_kb, 
       mime_type, title, description, year, semester, visibility) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [facultyId, file.originalname, storedFilename, fileSizeKb, file.mimetype, 
       title, description || null, yearValue, semester || null, visibility]
    );

    await pool.execute(
      `INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent) 
       VALUES (?, 'UPLOAD', ?, ?, ?)`,
      [result.insertId, facultyId, (req.ip || null), (req.get('user-agent') || null)]
    );

    res.json({ 
      fileId: result.insertId, 
      title, 
      version: 1,
      message: 'Timetable uploaded successfully' 
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getMyTimetables = async (req: AuthRequest, res: Response) => {
  try {
    const facultyId = req.user!.id;
    const { year, semester } = req.query;
    const { page, pageSize, limit, offset } = parsePagination(req.query.page, req.query.pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100
    });

    let sql = `
      SELECT id, title, description, original_filename, file_size_kb, mime_type, 
             year, semester, visibility, version, is_active, created_at
      FROM timetable_files
      WHERE uploaded_by = ? AND is_active = TRUE
    `;
    const params: any[] = [facultyId];

    if (year) {
      sql += ` AND year = ?`;
      params.push(year);
    }
    if (semester) {
      sql += ` AND semester = ?`;
      params.push(semester);
    }

    sql += ` ORDER BY created_at DESC`;

    const [allFiles]: any = await pool.execute<RowDataPacket[]>(sql, params);
    
    const files = allFiles.slice(offset, offset + limit);
    files.forEach((f: any) => formatRowDateTimes(f, ['created_at']));

    const [countResult] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM timetable_files WHERE uploaded_by = ? AND is_active = TRUE`,
      [facultyId]
    );

    res.json({ 
      files, 
      total: countResult[0].total,
      page,
      pageSize
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const downloadTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const [files] = await pool.execute<RowDataPacket[]>(
      `SELECT tf.*, f.department, uf.department as user_department
       FROM timetable_files tf
       JOIN faculty f ON tf.uploaded_by = f.id
       JOIN faculty uf ON uf.id = ?
       WHERE tf.id = ?`,
      [userId, id]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];

    const isOwner = file.uploaded_by === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    const isPublic = file.visibility === 'PUBLIC';
    const isDepartment = file.visibility === 'DEPARTMENT' && file.department === file.user_department;

    if (!isOwner && !isAdmin && !isPublic && !isDepartment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const year = file.year || new Date(file.created_at).getFullYear();
    const filePath = path.join(UPLOAD_BASE, file.uploaded_by.toString(), year.toString(), file.stored_filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    await pool.execute(
      `INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent) 
       VALUES (?, 'DOWNLOAD', ?, ?, ?)`,
      [id, userId, (req.ip || null), (req.get('user-agent') || null)]
    );

    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const previewTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const [files] = await pool.execute<RowDataPacket[]>(
      `SELECT tf.*, f.department, uf.department as user_department
       FROM timetable_files tf
       JOIN faculty f ON tf.uploaded_by = f.id
       JOIN faculty uf ON uf.id = ?
       WHERE tf.id = ?`,
      [userId, id]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];

    const isOwner = file.uploaded_by === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    const isPublic = file.visibility === 'PUBLIC';
    const isDepartment = file.visibility === 'DEPARTMENT' && file.department === file.user_department;

    if (!isOwner && !isAdmin && !isPublic && !isDepartment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const year = file.year || new Date(file.created_at).getFullYear();
    const filePath = path.join(UPLOAD_BASE, file.uploaded_by.toString(), year.toString(), file.stored_filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    if (!file.mime_type.includes('pdf') && !file.mime_type.includes('image')) {
      return res.status(400).json({ error: 'Preview not available for this file type' });
    }

    await pool.execute(
      `INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent) 
       VALUES (?, 'VIEW', ?, ?, ?)`,
      [id, userId, (req.ip || null), (req.get('user-agent') || null)]
    );

    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${file.original_filename}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const adminGetAllTimetables = async (req: AuthRequest, res: Response) => {
  try {
    const { facultyId, query } = req.query;
    const { page, pageSize, limit, offset } = parsePagination(req.query.page, req.query.pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100
    });

    let sql = `
      SELECT tf.id, tf.title, tf.description, tf.original_filename, tf.file_size_kb, 
             tf.mime_type, tf.year, tf.semester, tf.visibility, tf.version, tf.created_at,
             f.id as faculty_id, f.name as faculty_name, f.department, f.assigned_timetable_file_id
      FROM timetable_files tf
      JOIN faculty f ON tf.uploaded_by = f.id
      WHERE tf.is_active = TRUE
    `;
    const params: any[] = [];

    if (facultyId) {
      sql += ` AND tf.uploaded_by = ?`;
      params.push(facultyId);
    }
    if (query) {
      sql += ` AND (tf.title LIKE ? OR tf.description LIKE ? OR f.name LIKE ?)`;
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }

    sql += ` ORDER BY tf.created_at DESC`;

    const [allFiles]: any = await pool.execute<RowDataPacket[]>(sql, params);
    
    const files = allFiles.slice(offset, offset + limit);
    files.forEach((f: any) => formatRowDateTimes(f, ['created_at']));

    res.json({ files, page, pageSize });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const assignTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const { facultyId, fileId } = req.body;

    if (!facultyId || !fileId) {
      return res.status(400).json({ error: 'Faculty ID and File ID are required' });
    }

    const [files] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM timetable_files WHERE id = ?',
      [fileId]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'Timetable file not found' });
    }

    await pool.execute(
      'UPDATE faculty SET assigned_timetable_file_id = ? WHERE id = ?',
      [fileId, facultyId]
    );

    await pool.execute(
      `INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent, note) 
       VALUES (?, 'ASSIGN', ?, ?, ?, ?)`,
      [fileId, adminId, (req.ip || null), (req.get('user-agent') || null), `Assigned to faculty ID ${facultyId}`]
    );

    await pool.execute(
      `INSERT INTO admin_logs (admin_id, action_type, resource_type, resource_id, payload) 
       VALUES (?, 'ASSIGN_TIMETABLE', 'timetable_files', ?, ?)`,
      [adminId, fileId, JSON.stringify({ facultyId, fileId })]
    );

    res.json({ message: 'Timetable assigned successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const unassignTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const { facultyId } = req.body;

    if (!facultyId) {
      return res.status(400).json({ error: 'Faculty ID is required' });
    }

    const [faculty] = await pool.execute<RowDataPacket[]>(
      'SELECT assigned_timetable_file_id FROM faculty WHERE id = ?',
      [facultyId]
    );

    if (faculty.length === 0) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    const fileId = faculty[0].assigned_timetable_file_id;

    await pool.execute(
      'UPDATE faculty SET assigned_timetable_file_id = NULL WHERE id = ?',
      [facultyId]
    );

    if (fileId) {
      await pool.execute(
        `INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent, note) 
         VALUES (?, 'UNASSIGN', ?, ?, ?, ?)`,
        [fileId, adminId, (req.ip || null), (req.get('user-agent') || null), `Unassigned from faculty ID ${facultyId}`]
      );

      await logAdminActionFromReq(req, {
        actionType: 'UNASSIGN_TIMETABLE',
        resourceType: 'timetable_files',
        resourceId: fileId,
        payload: { facultyId, fileId }
      });
    }

    res.json({ message: 'Timetable unassigned successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTimetableFile = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const [files] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM timetable_files WHERE id = ?',
      [id]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];
    const isOwner = file.uploaded_by === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const year = file.year || new Date(file.created_at).getFullYear();
    const filePath = path.join(UPLOAD_BASE, file.uploaded_by.toString(), year.toString(), file.stored_filename);

    await pool.execute(
      `INSERT INTO timetable_access_logs (file_id, action, performed_by, ip_address, user_agent) 
       VALUES (?, 'DELETE', ?, ?, ?)`,
      [id, userId, (req.ip || null), (req.get('user-agent') || null)]
    );

    await pool.execute(
      'UPDATE faculty SET assigned_timetable_file_id = NULL WHERE assigned_timetable_file_id = ?',
      [id]
    );

    await pool.execute(
      'DELETE FROM timetable_files WHERE id = ?',
      [id]
    );

    if (isPrivilegedActor(userRole)) {
      await logAdminActionFromReq(req, {
        actionType: 'DELETE_TIMETABLE_FILE',
        resourceType: 'timetable_files',
        resourceId: Number(id),
        payload: { deletedBy: userId, fileOwnerId: file.uploaded_by, storedFilename: file.stored_filename }
      });
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Timetable file deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAssignedTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const facultyId = req.user!.id;

    const [faculty] = await pool.execute<RowDataPacket[]>(
      `SELECT f.assigned_timetable_file_id, tf.title, tf.description, tf.original_filename, 
              tf.file_size_kb, tf.mime_type, tf.year, tf.semester, tf.created_at
       FROM faculty f
       LEFT JOIN timetable_files tf ON f.assigned_timetable_file_id = tf.id
       WHERE f.id = ?`,
      [facultyId]
    );

    if (faculty.length === 0 || !faculty[0].assigned_timetable_file_id) {
      return res.json({ assigned: false, file: null });
    }

    formatRowDateTimes(faculty[0], ['created_at']);
    res.json({ assigned: true, file: faculty[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
