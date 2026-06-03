import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { formatRowDateTimes } from '../utils/timeFormat.js';

export const getFormDefinition = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { category } = req.params;
  const [forms]: any = await pool.execute(
    'SELECT * FROM form_definitions WHERE category = ? AND active = TRUE ORDER BY version DESC LIMIT 1', [category]
  );
  if (forms.length === 0) throw new AppError(404, 'NOT_FOUND', 'Form not found');

  const [fields] = await pool.execute(
    'SELECT * FROM form_fields WHERE form_id = ? ORDER BY order_index', [forms[0].id]
  );
  res.json({ ...forms[0], fields });
});

export const submitForm = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { form_id, category, payload } = req.body;
  if (!form_id || !category) throw new AppError(400, 'VALIDATION_ERROR', 'form_id and category are required');

  await pool.execute(
    'INSERT INTO form_submissions (form_id, faculty_id, category, payload) VALUES (?, ?, ?, ?)',
    [form_id, req.user!.id, category, JSON.stringify(payload || {})]
  );
  res.json({ message: 'Form submitted successfully' });
});

export const getSubmissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Math.abs(Number(req.query.pageSize)) || 200, 1000);
  const offset = Math.max(Math.abs(Number(req.query.page)) - 1 || 0, 0) * limit;
  const [rows]: any = await pool.execute(
    `SELECT fs.*, fd.name as form_name, f.name as reviewer_name
     FROM form_submissions fs
     JOIN form_definitions fd ON fs.form_id = fd.id
     LEFT JOIN faculty f ON fs.reviewer_id = f.id
     WHERE fs.faculty_id = ?
     ORDER BY fs.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    [req.user!.id]
  );
  rows.forEach((row: any) => formatRowDateTimes(row, ['created_at', 'updated_at']));
  res.json(rows);
});
