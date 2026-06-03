import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
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
const UPLOAD_BASE = path.join(__dirname, '../../uploads/vaultify');

const sha256File = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });

export const uploadFile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const facultyId = req.user!.id;
  const { title, description, category_id, visibility = 'PRIVATE' } = req.body;
  const file = req.file;
  if (!file) throw new AppError(400, 'NO_FILE', 'No file uploaded');
  let renamed = false;

  try {
    const year = new Date().getFullYear();
    const uuid = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    const storedFilename = `${uuid}_v1${ext}`;
    const facultyDir = path.join(UPLOAD_BASE, facultyId.toString(), year.toString());
    await fsp.mkdir(facultyDir, { recursive: true });

    const finalPath = path.join(facultyDir, storedFilename);
    await fsp.rename(file.path, finalPath);
    renamed = true;
    const checksum = await sha256File(finalPath);
    const fileSizeKb = Math.round(file.size / 1024);

    const [result] = await pool.execute<any>(
      `INSERT INTO vault_files (faculty_id, category_id, title, description, filename, original_filename,
       file_size_kb, mime_type, checksum, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [facultyId, category_id || null, title, description || null, storedFilename,
       file.originalname, fileSizeKb, file.mimetype, checksum, visibility]
    );

    await pool.execute(
      'INSERT INTO vault_access_logs (file_id, action, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
      [result.insertId, 'UPLOAD', facultyId, req.ip || null, req.get('user-agent') || null]
    );

    res.json({ fileId: result.insertId, title, version: 1, message: 'File uploaded successfully' });
  } catch (error) {
    if (file && !renamed && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch { /* ignore cleanup failures */ }
    }
    throw error;
  }
});

export const getMyFiles = asyncHandler(async (req: AuthRequest, res: Response) => {
  const facultyId = req.user!.id;
  const q = typeof req.query.query === 'string' ? req.query.query : null;
  const cat = typeof req.query.category === 'string' ? req.query.category : null;
  const vis = typeof req.query.visibility === 'string' ? req.query.visibility : null;
  const { page, pageSize, limit, offset } = parsePagination(req.query.page, req.query.pageSize, { defaultPageSize: 20, maxPageSize: 100 });

  const conditions: string[] = ['vf.faculty_id = ?', 'vf.archived = FALSE'];
  const params: any[] = [facultyId];
  if (q) { conditions.push('(vf.title LIKE ? OR vf.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (cat) { conditions.push('vf.category_id = ?'); params.push(cat); }
  if (vis) { conditions.push('vf.visibility = ?'); params.push(vis); }

  const [countResult] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM vault_files vf LEFT JOIN vault_categories vc ON vf.category_id = vc.id
     WHERE ${conditions.join(' AND ')}`, params
  );
  const total = Number(countResult[0]?.total ?? 0);

  const [files]: any = await pool.query<RowDataPacket[]>(
    `SELECT vf.id, vf.title, vf.description, vf.original_filename, vf.file_size_kb,
            vf.mime_type, vf.uploaded_at, vf.visibility, vf.version, vf.is_latest,
            vc.name as category_name
     FROM vault_files vf LEFT JOIN vault_categories vc ON vf.category_id = vc.id
     WHERE ${conditions.join(' AND ')} ORDER BY vf.uploaded_at DESC
     LIMIT ${limit} OFFSET ${offset}`, [...params]
  );
  files.forEach((f: any) => formatRowDateTimes(f, ['uploaded_at']));

  res.json({ files, total, page, pageSize });
});

export const downloadFile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const [files] = await pool.execute<RowDataPacket[]>(
    `SELECT vf.*, f.department, uf.department as user_department
     FROM vault_files vf JOIN faculty f ON vf.faculty_id = f.id
     JOIN faculty uf ON uf.id = ? WHERE vf.id = ?`, [userId, id]
  );
  if (files.length === 0) throw new AppError(404, 'NOT_FOUND', 'File not found');

  const file = files[0];
  const access = checkFileAccess(file, userId, userRole);
  if (!access.allowed) throw new AppError(403, 'FORBIDDEN', access.reason || 'Access denied');

  const year = new Date(file.uploaded_at).getFullYear();
  const filePath = path.join(UPLOAD_BASE, file.faculty_id.toString(), year.toString(), file.filename);
  if (!fs.existsSync(filePath)) throw new AppError(404, 'NOT_FOUND', 'File not found on disk');

  await pool.execute(
    'INSERT INTO vault_access_logs (file_id, action, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
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

export const previewFile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const [files] = await pool.execute<RowDataPacket[]>(
    `SELECT vf.*, f.department, uf.department as user_department
     FROM vault_files vf JOIN faculty f ON vf.faculty_id = f.id
     JOIN faculty uf ON uf.id = ? WHERE vf.id = ?`, [userId, id]
  );
  if (files.length === 0) throw new AppError(404, 'NOT_FOUND', 'File not found');

  const file = files[0];
  const access = checkFileAccess(file, userId, userRole);
  if (!access.allowed) throw new AppError(403, 'FORBIDDEN', access.reason || 'Access denied');

  const year = new Date(file.uploaded_at).getFullYear();
  const filePath = path.join(UPLOAD_BASE, file.faculty_id.toString(), year.toString(), file.filename);
  if (!fs.existsSync(filePath)) throw new AppError(404, 'NOT_FOUND', 'File not found on disk');

  if (!file.mime_type.includes('pdf') && !file.mime_type.includes('image')) {
    throw new AppError(400, 'PREVIEW_UNAVAILABLE', 'Preview not available for this file type');
  }

  await pool.execute(
    'INSERT INTO vault_access_logs (file_id, action, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
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

export const getCategories = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const [categories] = await pool.execute<RowDataPacket[]>('SELECT * FROM vault_categories ORDER BY name');
  res.json(categories);
});

export const deleteFile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const [files] = await pool.execute<RowDataPacket[]>('SELECT * FROM vault_files WHERE id = ?', [id]);
  if (files.length === 0) throw new AppError(404, 'NOT_FOUND', 'File not found');

  const file = files[0];
  const isOwner = file.faculty_id === userId;
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
  if (!isOwner && !isAdmin) throw new AppError(403, 'FORBIDDEN', 'Access denied');

  const year = new Date(file.uploaded_at).getFullYear();
  const filePath = path.join(UPLOAD_BASE, file.faculty_id.toString(), year.toString(), file.filename);

  await pool.execute(
    'INSERT INTO vault_access_logs (file_id, action, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
    [id, 'DELETE', userId, req.ip || null, req.get('user-agent') || null]
  );
  await pool.execute('DELETE FROM vault_files WHERE id = ?', [id]);
  try { await fsp.unlink(filePath); } catch { /* file may already be gone */ }

  res.json({ message: 'File deleted successfully' });
});

export const adminGetAllFiles = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { facultyId, query } = req.query;
  const { page, pageSize, limit, offset } = parsePagination(req.query.page, req.query.pageSize, { defaultPageSize: 20, maxPageSize: 100 });

  let sql = `SELECT vf.id, vf.title, vf.description, vf.original_filename, vf.file_size_kb,
                    vf.mime_type, vf.uploaded_at, vf.visibility, vf.version,
                    f.name as faculty_name, f.department, vc.name as category_name
             FROM vault_files vf JOIN faculty f ON vf.faculty_id = f.id
             LEFT JOIN vault_categories vc ON vf.category_id = vc.id WHERE vf.archived = FALSE`;
  const params: any[] = [];
  if (facultyId) { sql += ' AND vf.faculty_id = ?'; params.push(facultyId); }
  if (query) { sql += ' AND (vf.title LIKE ? OR vf.description LIKE ? OR f.name LIKE ?)'; params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
  sql += ' ORDER BY vf.uploaded_at DESC';

  const countSql = `SELECT COUNT(*) as total FROM vault_files vf JOIN faculty f ON vf.faculty_id = f.id LEFT JOIN vault_categories vc ON vf.category_id = vc.id WHERE vf.archived = FALSE` +
    (facultyId ? ' AND vf.faculty_id = ?' : '') +
    (query ? ' AND (vf.title LIKE ? OR vf.description LIKE ? OR f.name LIKE ?)' : '');
  const [countResult]: any = await pool.execute<RowDataPacket[]>(countSql, params);
  const total = Number(countResult[0]?.total ?? 0);

  const [files]: any = await pool.execute<RowDataPacket[]>(sql + ` LIMIT ${limit} OFFSET ${offset}`, [...params]);
  files.forEach((f: any) => formatRowDateTimes(f, ['uploaded_at']));
  res.json({ files, total, page, pageSize });
});
