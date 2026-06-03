import { pool } from '../config/database.js';
import * as XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import { AppError } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { isValidEmail } from '../utils/validation.js';
import { parseSpDiagnostic, spErrorDiagnostic, spUnknownDiagnostic } from '../utils/spDiagnostics.js';
import { sendBulkImportWelcomeEmail } from '../utils/emailTemplates.js';
import { AuditService } from './AuditService.js';

const DEFAULT_PASSWORD = (() => {
  const pwd = process.env.BULK_IMPORT_DEFAULT_PASSWORD;
  if (!pwd) throw new Error('[DEBUG ERROR] BULK_IMPORT_DEFAULT_PASSWORD is not set');
  return pwd;
})();

export interface BulkImportRow {
  employee_id: string;
  name: string;
  email: string;
  department?: string;
  designation?: string;
}

export interface BulkImportResult {
  success: number;
  failed: number;
  errors: { row: number; error: string }[];
  leaveWarnings: { row: number; email: string; warning: string }[];
}

export class BulkImportService {
  static async parseExcel(filePath: string): Promise<{ rows: BulkImportRow[]; errors: { row: number; error: string }[] }> {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

    const rows: BulkImportRow[] = [];
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < data.length; i++) {
      const raw = data[i];
      const rowNumber = i + 2;

      const employee_id = String(raw['Employee ID'] || raw['employee_id'] || '').trim();
      const name = String(raw['Name'] || raw['name'] || '').trim();
      const email = String(raw['Email'] || raw['email'] || '').trim();
      const department = String(raw['Department'] || raw['department'] || '').trim() || undefined;
      const designation = String(raw['Designation'] || raw['designation'] || '').trim() || undefined;

      if (!employee_id) {
        errors.push({ row: rowNumber, error: 'Missing employee_id' });
        continue;
      }
      if (!name) {
        errors.push({ row: rowNumber, error: 'Missing name' });
        continue;
      }
      if (!email || !isValidEmail(email)) {
        errors.push({ row: rowNumber, error: `Invalid email: "${email}"` });
        continue;
      }

      rows.push({ employee_id, name, email, department, designation });
    }

    return { rows, errors };
  }

  static async importUsers(
    req: AuthRequest,
    rows: BulkImportRow[],
    connection: any
  ): Promise<BulkImportResult> {
    const result: BulkImportResult = { success: 0, failed: 0, errors: [], leaveWarnings: [] };

    const [roleRows]: any = await connection.execute('SELECT id FROM roles WHERE name = ?', ['FACULTY']);
    const roleId = roleRows[0]?.id ?? 4;

    const [facultyTypes]: any = await connection.execute('SELECT id FROM faculty_types WHERE id = 1 LIMIT 1');
    const defaultFacultyTypeId = facultyTypes[0]?.id ?? 1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

        const [insertResult]: any = await connection.execute(
          `INSERT INTO faculty (employee_id, name, email, password_hash, role_id, faculty_type_id, department, designation, approved, active, imported, force_password_reset)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE, TRUE, TRUE)`,
          [row.employee_id, row.name, row.email, passwordHash, roleId, defaultFacultyTypeId, row.department ?? null, row.designation ?? null]
        );
        const facultyId = insertResult.insertId;

        result.success++;

        try {
          const [spResult]: any = await connection.query(`CALL sp_assign_default_leaves(${facultyId})`);
          const diagnostic = parseSpDiagnostic(spResult);
          if (diagnostic && diagnostic.status !== 'OK') {
            result.leaveWarnings.push({
              row: rowNum,
              email: row.email,
              warning: diagnostic.message || diagnostic.status
            });
          }
        } catch (spError: any) {
          result.leaveWarnings.push({
            row: rowNum,
            email: row.email,
            warning: spErrorDiagnostic(spError.message).message
          });
        }

        try {
          await sendBulkImportWelcomeEmail({ email: row.email, name: row.name, employeeId: row.employee_id, defaultPassword: DEFAULT_PASSWORD });
        } catch { /* email failure is non-fatal */ }

      } catch (insertError: any) {
        if (insertError.code === 'ER_DUP_ENTRY') {
          result.errors.push({ row: rowNum, error: `Duplicate entry: ${row.email} or ${row.employee_id}` });
        } else {
          result.errors.push({ row: rowNum, error: insertError.message });
        }
        result.failed++;
      }
    }

    return result;
  }
}
