import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { formatRowDates, formatRowDateTimes } from '../utils/timeFormat.js';
import { trySendMail } from '../utils/mailer.js';

export const createProductRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { item_name, quantity, reason } = req.body;
    
    const [result] = await pool.execute(
      `INSERT INTO product_requests (faculty_id, item_name, quantity, reason) VALUES (?, ?, ?, ?)`,
      [req.user!.id, item_name, quantity, reason]
    );
    
    res.status(201).json({ message: 'Product request created', id: (result as any).insertId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getMyProductRequests = async (req: AuthRequest, res: Response) => {
  try {
    const [rows]: any = await pool.execute(
      `SELECT pr.*, f.name as admin_name 
       FROM product_requests pr
       LEFT JOIN faculty f ON pr.admin_id = f.id
       WHERE pr.faculty_id = ? AND pr.status != 'DELETED'
       ORDER BY pr.created_at DESC`,
      [req.user!.id]
    );
    rows.forEach((row: any) => {
      formatRowDates(row, ['created_at', 'reviewed_at', 'deleted_at']);
    });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllProductRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    
    let query = `SELECT pr.*, f.name as faculty_name, f.department, f.employee_id, f.designation, f.email,
                        a.name as admin_name
                 FROM product_requests pr
                 JOIN faculty f ON pr.faculty_id = f.id
                 LEFT JOIN faculty a ON pr.admin_id = a.id`;
    const params: any[] = [];
    
    if (status) {
      query += ` WHERE pr.status = ?`;
      params.push(status);
    } else {
      query += ` WHERE pr.status IN ('PENDING', 'APPROVED', 'REJECTED')`;
    }
    
    query += ` ORDER BY FIELD(pr.status, 'PENDING', 'APPROVED', 'REJECTED'), pr.created_at DESC`;
    
    const [rows]: any = await pool.execute(query, params);
    rows.forEach((row: any) => {
      formatRowDates(row, ['created_at']);
      formatRowDateTimes(row, ['reviewed_at']);
    });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const reviewProductRequest = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { id } = req.params;
    const { action, reason } = req.body;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: 'Reason is required for approval/rejection' });
    }
    
    await connection.beginTransaction();
    
    const [[request]] = await connection.execute(
      `SELECT pr.*, f.email as faculty_email, f.name as faculty_name
       FROM product_requests pr
       JOIN faculty f ON pr.faculty_id = f.id
       WHERE pr.id = ? FOR UPDATE`,
      [id]
    ) as any;
    
    if (!request || request.status !== 'PENDING') {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid request or already processed' });
    }
    
    await connection.execute(
      `UPDATE product_requests SET status = ?, admin_id = ?, admin_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [action, req.user!.id, reason, id]
    );
    
    await connection.execute(
      `INSERT INTO admin_logs (admin_id, action_type, resource_type, resource_id, payload, ip_address)
       VALUES (?, ?, 'product_request', ?, ?, ?)`,
      [
        req.user!.id,
        action === 'APPROVED' ? 'PRODUCT_APPROVE' : 'PRODUCT_REJECT',
        id,
        JSON.stringify({ before: { status: 'PENDING' }, after: { status: action }, reason }),
        (req.ip || null)
      ]
    );

    await connection.commit();

    if (request.faculty_email) {
      const subject = `Product request ${action.toLowerCase()}`;
      const text =
        `Hello ${request.faculty_name || ''},\n\n` +
        `Your product request for "${request.item_name}" (Quantity: ${request.quantity}) has been ${action.toLowerCase()}.\n\n` +
        `Request reason: ${request.reason}\n\n` +
        `Reviewer note: ${reason}\n\n` +
        `Regards,\nFaculty Portal`;

      await trySendMail({ to: request.faculty_email, subject, text });
    }

    res.json({ message: `Product request ${action.toLowerCase()}` });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

export const deleteProductRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const [[request]]: any = await pool.execute(
      `SELECT faculty_id, status FROM product_requests WHERE id = ?`,
      [id]
    );
    
    if (!request) {
      return res.status(404).json({ error: 'Product request not found' });
    }
    
    if (request.faculty_id !== req.user!.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending requests can be deleted' });
    }
    
    await pool.execute(
      `UPDATE product_requests SET status = 'DELETED', deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    
    res.json({ message: 'Product request deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getProductRequestDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const [[request]]: any = await pool.execute(
      `SELECT pr.*, f.name as faculty_name, f.employee_id, f.department, f.designation, f.email,
              a.name as admin_name
       FROM product_requests pr
       JOIN faculty f ON pr.faculty_id = f.id
       LEFT JOIN faculty a ON pr.admin_id = a.id
       WHERE pr.id = ?`,
      [id]
    );
    
    if (!request) {
      return res.status(404).json({ error: 'Product request not found' });
    }
    
    formatRowDates(request, ['created_at']);
    formatRowDateTimes(request, ['reviewed_at']);
    res.json(request);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
