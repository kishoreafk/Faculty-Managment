import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePagination } from '../utils/pagination.js';
import { formatRowDateTimes } from '../utils/timeFormat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_BASE = path.join(__dirname, '../../uploads/vaultify');

if (!fs.existsSync(UPLOAD_BASE)) {
  fs.mkdirSync(UPLOAD_BASE, { recursive: true });
}

const sha256File = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });

export const uploadFile = async (req: AuthRequest, res: Response) => {
  try {
    const facultyId = req.user!.id;
    const { title, description, category_id, visibility = 'PRIVATE' } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const year = new Date().getFullYear();
    const uuid = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    const storedFilename = `${uuid}_v1${ext}`;
    
    const facultyDir = path.join(UPLOAD_BASE, facultyId.toString(), year.toString());
    if (!fs.existsSync(facultyDir)) {
      fs.mkdirSync(facultyDir, { recursive: true });
    }

    const finalPath = path.join(facultyDir, storedFilename);
    fs.renameSync(file.path, finalPath);

    const checksum = await sha256File(finalPath);
    const fileSizeKb = Math.round(file.size / 1024);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO vault_files (faculty_id, category_id, title, description, filename, original_filename, 
       file_size_kb, mime_type, checksum, visibility) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [facultyId, category_id || null, title, description || null, storedFilename, 
       file.originalname, fileSizeKb, file.mimetype, checksum, visibility]
    );

    await pool.execute(
      `INSERT INTO vault_access_logs (file_id, action, performed_by, ip_address, user_agent) 
       VALUES (?, 'UPLOAD', ?, ?, ?)`,
      [result.insertId, facultyId, (req.ip || null), (req.get('user-agent') || null)]
    );

    res.json({ 
      fileId: result.insertId, 
      title, 
      version: 1,
      message: 'File uploaded successfully' 
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getMyFiles = async (req: AuthRequest, res: Response) => {
  try {
    const facultyId = req.user!.id;
    const { query, category, visibility } = req.query;
    const { page, pageSize, limit, offset } = parsePagination(req.query.page, req.query.pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100
    });

    let sql = `
      SELECT vf.id, vf.title, vf.description, vf.original_filename, vf.file_size_kb, 
             vf.mime_type, vf.uploaded_at, vf.visibility, vf.version, vf.is_latest,
             vc.name as category_name
      FROM vault_files vf
      LEFT JOIN vault_categories vc ON vf.category_id = vc.id
      WHERE vf.faculty_id = ? AND vf.archived = FALSE
    `;
    const params: any[] = [facultyId];

    if (query) {
      sql += ` AND (vf.title LIKE ? OR vf.description LIKE ?)`;
      params.push(`%${query}%`, `%${query}%`);
    }
    if (category) {
      sql += ` AND vf.category_id = ?`;
      params.push(parseInt(category as string));
    }
    if (visibility) {
      sql += ` AND vf.visibility = ?`;
      params.push(visibility);
    }

    sql += ` ORDER BY vf.uploaded_at DESC`;
    
    const [allFiles]: any = await pool.execute<RowDataPacket[]>(sql, params);
    
    const files = allFiles.slice(offset, offset + limit);
    files.forEach((f: any) => formatRowDateTimes(f, ['uploaded_at']));

    let countSql = `SELECT COUNT(*) as total FROM vault_files WHERE faculty_id = ? AND archived = FALSE`;
    const countParams: any[] = [facultyId];

    if (query) {
      countSql += ` AND (title LIKE ? OR description LIKE ?)`;
      countParams.push(`%${query}%`, `%${query}%`);
    }
    if (category) {
      countSql += ` AND category_id = ?`;
      countParams.push(parseInt(category as string));
    }
    if (visibility) {
      countSql += ` AND visibility = ?`;
      countParams.push(visibility);
    }

    const [countResult] = await pool.execute<RowDataPacket[]>(countSql, countParams);

    res.json({ 
      files, 
      total: countResult[0].total,
      page,
      pageSize
    });
  } catch (error: any) {
    console.error('Vaultify getMyFiles error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const downloadFile = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const [files] = await pool.execute<RowDataPacket[]>(
      `SELECT vf.*, f.department, uf.department as user_department
       FROM vault_files vf 
       JOIN faculty f ON vf.faculty_id = f.id 
       JOIN faculty uf ON uf.id = ?
       WHERE vf.id = ?`,
      [userId, id]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];

    const isOwner = file.faculty_id === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    const isPublic = file.visibility === 'PUBLIC';
    const isDepartment = file.visibility === 'DEPARTMENT' && file.department === file.user_department;

    if (!isOwner && !isAdmin && !isPublic && !isDepartment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const year = new Date(file.uploaded_at).getFullYear();
    const filePath = path.join(UPLOAD_BASE, file.faculty_id.toString(), year.toString(), file.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    await pool.execute(
      `INSERT INTO vault_access_logs (file_id, action, performed_by, ip_address, user_agent) 
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

export const previewFile = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [files] = await pool.execute<RowDataPacket[]>(
      `SELECT vf.*, f.department, uf.department as user_department
       FROM vault_files vf 
       JOIN faculty f ON vf.faculty_id = f.id 
       JOIN faculty uf ON uf.id = ?
       WHERE vf.id = ?`,
      [userId, id]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];

    const isOwner = file.faculty_id === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    const isPublic = file.visibility === 'PUBLIC';
    const isDepartment = file.visibility === 'DEPARTMENT' && file.department === file.user_department;

    if (!isOwner && !isAdmin && !isPublic && !isDepartment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const year = new Date(file.uploaded_at).getFullYear();
    const filePath = path.join(UPLOAD_BASE, file.faculty_id.toString(), year.toString(), file.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    if (!file.mime_type.includes('pdf') && !file.mime_type.includes('image')) {
      return res.status(400).json({ error: 'Preview not available for this file type' });
    }

    if (userId) {
      await pool.execute(
        `INSERT INTO vault_access_logs (file_id, action, performed_by, ip_address, user_agent) 
         VALUES (?, 'VIEW', ?, ?, ?)`,
        [id, userId, (req.ip || null), (req.get('user-agent') || null)]
      );
    }

    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${file.original_filename}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCategories = async (req: AuthRequest, res: Response) => {
  try {
    const [categories] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM vault_categories ORDER BY name'
    );
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteFile = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const [files] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM vault_files WHERE id = ?',
      [id]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];
    const isOwner = file.faculty_id === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const year = new Date(file.uploaded_at).getFullYear();
    const filePath = path.join(UPLOAD_BASE, file.faculty_id.toString(), year.toString(), file.filename);

    await pool.execute(
      `INSERT INTO vault_access_logs (file_id, action, performed_by, ip_address, user_agent) 
       VALUES (?, 'DELETE', ?, ?, ?)`,
      [id, userId, (req.ip || null), (req.get('user-agent') || null)]
    );

    await pool.execute(
      'DELETE FROM vault_files WHERE id = ?',
      [id]
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'File deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const adminGetAllFiles = async (req: AuthRequest, res: Response) => {
  try {
    const { facultyId, query } = req.query;
    const { page, pageSize, limit, offset } = parsePagination(req.query.page, req.query.pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100
    });

    let sql = `
      SELECT vf.id, vf.title, vf.description, vf.original_filename, vf.file_size_kb, 
             vf.mime_type, vf.uploaded_at, vf.visibility, vf.version,
             f.name as faculty_name, f.department, vc.name as category_name
      FROM vault_files vf
      JOIN faculty f ON vf.faculty_id = f.id
      LEFT JOIN vault_categories vc ON vf.category_id = vc.id
      WHERE vf.archived = FALSE
    `;
    const params: any[] = [];

    if (facultyId) {
      sql += ` AND vf.faculty_id = ?`;
      params.push(facultyId);
    }
    if (query) {
      sql += ` AND (vf.title LIKE ? OR vf.description LIKE ? OR f.name LIKE ?)`;
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }

    sql += ` ORDER BY vf.uploaded_at DESC`;
    
    const [allFiles]: any = await pool.execute<RowDataPacket[]>(sql, params);
    
    const files = allFiles.slice(offset, offset + limit);
    files.forEach((f: any) => formatRowDateTimes(f, ['uploaded_at']));

    res.json({ files, page, pageSize });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
