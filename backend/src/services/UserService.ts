import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { requireEnv } from '../config/env.js';
import { AuthRequest } from '../middleware/auth.js';
import { facultyRepository } from '../repositories/FacultyRepository.js';
import { AuditService } from './AuditService.js';
import { parseSpDiagnostic } from '../utils/spDiagnostics.js';
import { sendAccountCreatedEmail } from '../utils/emailTemplates.js';

export class UserService {
  static async createUser(req: AuthRequest, data: any): Promise<any> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const existingEmail = await connection.execute(
        'SELECT id FROM faculty WHERE LOWER(email) = LOWER(?) LIMIT 1',
        [data.email]
      );
      if ((existingEmail[0] as any[]).length > 0) {
        throw new AppError(409, 'DUPLICATE_EMAIL', 'Email already exists');
      }

      const existingEmpId = await connection.execute(
        'SELECT id FROM faculty WHERE employee_id = ? LIMIT 1',
        [data.employee_id]
      );
      if ((existingEmpId[0] as any[]).length > 0) {
        throw new AppError(409, 'DUPLICATE_EMPLOYEE_ID', 'Employee ID already exists');
      }

      const [[roleRow]]: any = await connection.execute(
        'SELECT id FROM roles WHERE name = ?', [data.role || 'FACULTY']
      );
      const roleId = roleRow?.id ?? 4;

      const defaultPwd = requireEnv('BULK_IMPORT_DEFAULT_PASSWORD');
      const passwordHash = await bcrypt.hash(data.password || defaultPwd, 10);
      const [result]: any = await connection.execute(
        `INSERT INTO faculty (employee_id, name, email, password_hash, role_id, faculty_type_id, department, designation, doj, gender, experience_years, qualification, approved, active, created_by_admin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE, ?)`,
        [
          data.employee_id, data.name, data.email, passwordHash,
          roleId, data.faculty_type_id,
          data.department || null, data.designation || null,
          data.joining_date || null, data.gender || null,
          data.experience_years || 0, data.qualification || null,
          req.user?.id ?? null
        ]
      );
      const facultyId = result.insertId;

      let leaveDiagnostic: any = null;
      try {
        const [spResult]: any = await connection.query(`CALL sp_assign_default_leaves(${facultyId})`);
        leaveDiagnostic = parseSpDiagnostic(spResult);
      } catch (_spError) {
        leaveDiagnostic = { status: 'SP_ERROR', message: 'Stored procedure error' };
      }

      await connection.commit();

      await AuditService.logFromRequest(req, {
        action: 'USER_CREATED',
        entityType: 'faculty',
        entityId: facultyId,
        entityLabel: data.email,
        afterState: { employee_id: data.employee_id, role: data.role, role_id: roleId }
      });

      try {
        await sendAccountCreatedEmail({ email: data.email, name: data.name }, { password: data.password || defaultPwd });
      } catch { /* non-fatal */ }

      return { id: facultyId, diagnostic: leaveDiagnostic };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateUser(req: AuthRequest, id: number, data: any): Promise<any> {
    const user = await facultyRepository.findById(id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    const beforeState = { ...user };
    const updateData: Record<string, any> = {};

    if (user.imported && !data.force_update) {
      throw new AppError(403, 'LOCKED', 'Imported users must be edited with forceUpdate=true');
    }

    const updatableFields = ['name', 'email', 'department', 'designation', 'faculty_type_id', 'doj', 'gender', 'experience_years', 'qualification', 'active', 'role_id'];
    for (const field of updatableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (user.imported && data.force_update) {
      updateData.imported = false;
      updateData.force_password_reset = true;
    }

    if (Object.keys(updateData).length > 0) {
      await facultyRepository.update(id, updateData);
    }

    const updated = await facultyRepository.findById(id);

    await AuditService.logFromRequest(req, {
      action: 'USER_UPDATED',
      entityType: 'faculty',
      entityId: id,
      entityLabel: user.email,
      beforeState,
      afterState: updated
    });

    return updated;
  }

  static async toggleUserStatus(id: number, action: 'activate' | 'deactivate', req: AuthRequest): Promise<any> {
    const user = await facultyRepository.findById(id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    if (action === 'activate') {
      await pool.execute('UPDATE faculty SET active = TRUE WHERE id = ?', [id]);
    } else {
      await pool.execute('UPDATE faculty SET active = FALSE WHERE id = ?', [id]);
    }

    await AuditService.logFromRequest(req, {
      action: action === 'activate' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entityType: 'faculty',
      entityId: id,
      entityLabel: user.email
    });

    return facultyRepository.findById(id);
  }

  static async deleteUser(id: number, req: AuthRequest): Promise<void> {
    const user = await facultyRepository.findById(id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    await facultyRepository.softDelete(id);

    await AuditService.logFromRequest(req, {
      action: 'USER_DELETED',
      entityType: 'faculty',
      entityId: id,
      entityLabel: user.email
    });
  }

  static async restoreUser(id: number, req: AuthRequest): Promise<void> {
    const [rows]: any = await pool.execute('SELECT * FROM faculty WHERE id = ? AND deleted = TRUE', [id]);
    if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Deleted user not found');

    await facultyRepository.restore(id);

    await AuditService.logFromRequest(req, {
      action: 'USER_RESTORED',
      entityType: 'faculty',
      entityId: id,
      entityLabel: rows[0].email
    });
  }

  static async bulkDelete(ids: number[], req: AuthRequest): Promise<number> {
    for (const id of ids) {
      await pool.execute('UPDATE faculty SET deleted = TRUE, deleted_at = NOW() WHERE id = ?', [id]);
    }

    await AuditService.logFromRequest(req, {
      action: 'BULK_DELETE',
      entityType: 'faculty',
      entityId: null,
      entityLabel: `${ids.length} users`
    });

    return ids.length;
  }

  static async promoteUser(id: number, newRoleId: number, req: AuthRequest): Promise<any> {
    const user = await facultyRepository.findById(id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    await pool.execute('UPDATE faculty SET role_id = ? WHERE id = ?', [newRoleId, id]);

    const [roleRows]: any = await pool.execute('SELECT name FROM roles WHERE id = ?', [newRoleId]);
    const roleName = roleRows[0]?.name ?? 'UNKNOWN';

    await AuditService.logFromRequest(req, {
      action: 'USER_PROMOTED',
      entityType: 'faculty',
      entityId: id,
      entityLabel: `${user.email} → ${roleName}`,
      beforeState: { role_id: user.role_id },
      afterState: { role_id: newRoleId }
    });

    return facultyRepository.findById(id);
  }

  static async approveUser(id: number, req: AuthRequest): Promise<any> {
    const connection = await pool.getConnection();
    try {
      const user = await facultyRepository.findById(id);
      if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

      await connection.beginTransaction();

      const [roleRows]: any = await connection.execute('SELECT id FROM roles WHERE name = ?', ['FACULTY']);
      const facultyRoleId = roleRows[0]?.id ?? 4;
      await connection.execute('UPDATE faculty SET approved = TRUE, role_id = ? WHERE id = ?', [facultyRoleId, id]);

      try {
        const [spResult]: any = await connection.query(`CALL sp_assign_default_leaves(${id})`);
        const diagnostic = parseSpDiagnostic(spResult);
        await connection.commit();

        await AuditService.logFromRequest(req, {
          action: 'USER_APPROVED',
          entityType: 'faculty',
          entityId: id,
          entityLabel: user.email
        });

        try {
          await sendAccountCreatedEmail({ email: user.email, name: user.name });
        } catch { /* non-fatal */ }

        return { diagnostic };
      } catch (spError) {
        await connection.rollback();
        throw new AppError(500, 'SP_ERROR', 'Leave assignment failed');
      }
    } finally {
      connection.release();
    }
  }

  static async forceLogout(id: number, req: AuthRequest): Promise<void> {
    const user = await facultyRepository.findById(id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    const [tokens]: any = await pool.execute('SELECT jti FROM auth_token_revocations WHERE jti LIKE ?', [`%${id}%`]);
    await pool.execute(
      `INSERT INTO auth_token_revocations (jti, expires_at)
       SELECT jti, DATE_ADD(NOW(), INTERVAL 1 DAY) FROM auth_tokens WHERE faculty_id = ? AND revoked = FALSE`,
      [id]
    );
    await pool.execute('UPDATE auth_tokens SET revoked = TRUE, revoked_at = NOW() WHERE faculty_id = ?', [id]);

    await AuditService.logFromRequest(req, {
      action: 'FORCE_LOGOUT',
      entityType: 'faculty',
      entityId: id,
      entityLabel: user.email
    });
  }
}
