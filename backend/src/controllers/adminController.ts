import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { trySendMail } from '../utils/mailer.js';
import { formatRowDates, formatRowDateTimes } from '../utils/timeFormat.js';

export const getPendingFaculty = async (req: AuthRequest, res: Response) => {
  try {
    const [rows]: any = await pool.execute(
      `SELECT f.*, ft.name as faculty_type_name 
       FROM faculty f 
       JOIN faculty_types ft ON f.faculty_type_id = ft.id 
       WHERE f.approved = FALSE AND f.active = TRUE 
       ORDER BY f.created_at ASC`
    );
    rows.forEach((row: any) => {
      formatRowDates(row, ['doj']);
      formatRowDateTimes(row, ['created_at', 'updated_at']);
    });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const approveFaculty = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    await connection.beginTransaction();

    const [facultyRows]: any = await connection.execute(
      'SELECT email, name, approved FROM faculty WHERE id = ? FOR UPDATE',
      [id]
    );

    if (facultyRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    if (facultyRows[0].approved) {
      await connection.rollback();
      return res.status(400).json({ error: 'User already approved' });
    }
    
    let role_id = 4; // Default to FACULTY
    if (role) {
      const [roleResult]: any = await connection.execute('SELECT id FROM roles WHERE name = ?', [role]);
      if (roleResult.length > 0) {
        role_id = roleResult[0].id;
      }
    }
    
    await connection.execute(`UPDATE faculty SET approved = TRUE, role_id = ? WHERE id = ?`, [role_id, id]);
    
    await connection.execute(
      `INSERT INTO admin_logs (admin_id, action_type, resource_type, resource_id, payload, ip_address)
       VALUES (?, 'FACULTY_APPROVE', 'faculty', ?, ?, ?)`,
      [req.user!.id, id, JSON.stringify({ approved: true, role_id }), (req.ip || null)]
    );
    
    await connection.commit();

    const email = facultyRows[0].email as string | null | undefined;
    const name = facultyRows[0].name as string | null | undefined;

    if (email) {
      const subject = 'Your Faculty Portal account has been approved';
      const text =
        `Hello ${name || ''},\n\n` +
        `Your account has been approved by an administrator. You can now log in to the Faculty Portal.\n\n` +
        `Regards,\nFaculty Portal`;

      await trySendMail({ to: email, subject, text });
    }

    res.json({ message: 'Faculty approved and leave balances initialized' });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

export const rejectFaculty = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    await connection.beginTransaction();
    
    await connection.execute(`UPDATE faculty SET active = FALSE WHERE id = ?`, [id]);
    
    await connection.execute(
      `INSERT INTO admin_logs (admin_id, action_type, resource_type, resource_id, payload, reason, ip_address)
       VALUES (?, 'FACULTY_REJECT', 'faculty', ?, ?, ?, ?)`,
      [req.user!.id, id, JSON.stringify({ approved: false }), reason || 'Registration rejected', (req.ip || null)]
    );
    
    await connection.commit();
    res.json({ message: 'Faculty registration rejected' });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

export const getAllFaculty = async (req: AuthRequest, res: Response) => {
  try {
    const [rows]: any = await pool.execute(
      `SELECT f.*, ft.name as faculty_type_name, r.name as role_name 
       FROM faculty f 
       JOIN faculty_types ft ON f.faculty_type_id = ft.id 
       JOIN roles r ON f.role_id = r.id 
       WHERE f.active = TRUE 
       ORDER BY f.name`
    );
    rows.forEach((row: any) => {
      formatRowDates(row, ['doj']);
      formatRowDateTimes(row, ['created_at', 'updated_at', 'last_login']);
    });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getFacultyTypes = async (req: AuthRequest, res: Response) => {
  try {
    const [rows] = await pool.execute(`SELECT * FROM faculty_types WHERE active = TRUE`);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
