import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { requireEnv } from '../config/env.js';
import { BulkImportService } from '../services/BulkImportService.js';
import { AuditService } from '../services/AuditService.js';
import { FileUploadService } from '../services/FileUploadService.js';
import * as XLSX from 'xlsx';
import { sendBulkImportWelcomeEmail } from '../utils/emailTemplates.js';
import { RowDataPacket } from 'mysql2';

const REQUIRED_IMPORT_COLUMNS = [
  'employee_id', 'name', 'email', 'department',
  'designation', 'faculty_type_id', 'joining_date'
];

const OPTIONAL_IMPORT_COLUMNS = [
  'gender', 'experience_years', 'qualification', 'role'
];

export const downloadSampleExcel = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const sampleSheet = XLSX.utils.aoa_to_sheet([
    REQUIRED_IMPORT_COLUMNS,
    ['EMP001', 'John Doe', 'john.doe@example.com', 'Computer Science', 'Assistant Professor', '1', '2024-01-15'],
    ['EMP002', 'Jane Smith', 'jane.smith@example.com', 'Electrical Engineering', 'Associate Professor', '2', '2023-07-01']
  ]);
  sampleSheet['!cols'] = REQUIRED_IMPORT_COLUMNS.map(() => ({ wch: 22 }));

  // Fetch faculty types from DB so the instructions are always in sync
  const [facultyTypes] = await pool.execute<RowDataPacket[]>(
    'SELECT id, name, category FROM faculty_types WHERE active = TRUE ORDER BY id'
  );

  const hintsRows: any[][] = [
    ['Column', 'Required', 'Format / Allowed Values', 'Description'],
    ...REQUIRED_IMPORT_COLUMNS.map(col => [
      col, 'YES',
      {
        employee_id: 'Alphanumeric, unique',
        name: 'Text, max 100 chars',
        email: 'Valid email, unique',
        department: 'Text, max 100 chars',
        designation: 'Text, max 100 chars',
        faculty_type_id: facultyTypes.map((ft: any) => `${ft.id}=${ft.name}`).join(', '),
        joining_date: 'YYYY-MM-DD or DD/MM/YYYY'
      }[col],
      {
        employee_id: 'Unique employee identifier',
        name: 'Full legal name',
        email: 'Official email for login',
        department: 'Department name',
        designation: 'Job title',
        faculty_type_id: 'Numeric ID from the Faculty Types table below',
        joining_date: 'Date of joining'
      }[col]
    ]),
    ...OPTIONAL_IMPORT_COLUMNS.map(col => [
      col, 'NO',
      {
        gender: 'MALE, FEMALE, or OTHER',
        experience_years: 'Non-negative integer',
        qualification: 'Text, max 255 chars',
        role: 'FACULTY, HOD, ADMIN, SUPER_ADMIN'
      }[col],
      {
        gender: 'Optional gender field',
        experience_years: 'Optional years of experience',
        qualification: 'Optional highest degree',
        role: 'Optional. Defaults to FACULTY'
      }[col]
    ]),
    [],
    ['--- FACULTY TYPES (id → name) ---'],
    ['ID', 'Name', 'Category'],
    ...facultyTypes.map((ft: any) => [String(ft.id), ft.name, ft.category]),
    [],
    ['--- ROLES ---'],
    ['Role', 'Description'],
    ['FACULTY', 'Regular faculty member'],
    ['HOD', 'Head of Department'],
    ['ADMIN', 'Administrator'],
    ['SUPER_ADMIN', 'Super Administrator']
  ];

  const hintsSheet = XLSX.utils.aoa_to_sheet(hintsRows);
  hintsSheet['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 55 }, { wch: 60 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sampleSheet, 'Users');
  XLSX.utils.book_append_sheet(workbook, hintsSheet, 'Instructions');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="faculty_bulk_import_template.xlsx"');
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
});

export const bulkImportUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const file = (req as any).file as { path: string; originalname: string; size: number } | undefined;
  if (!file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

  const { rows, errors } = await BulkImportService.parseExcel(file.path);

  if (rows.length === 0) {
    await FileUploadService.cleanupTempFile(file.path);
    throw new AppError(400, 'NO_ROWS', 'No valid rows found in the file');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await BulkImportService.importUsers(req, rows, connection);
    await connection.commit();

    await AuditService.logFromRequest(req, {
      action: 'BULK_IMPORT_USERS',
      entityType: 'faculty',
      entityLabel: `${result.success} users imported, ${result.failed} failed`,
      afterState: { filename: file.originalname, success: result.success, failed: result.failed }
    });

    for (const u of rows) {
      await sendBulkImportWelcomeEmail({
        email: u.email, name: u.name, employeeId: u.employee_id,
        defaultPassword: requireEnv('BULK_IMPORT_DEFAULT_PASSWORD')
      }).catch(() => {});
    }

    res.status(201).json({
      message: result.leaveWarnings.length > 0
        ? `Imported ${result.success} users. ${result.leaveWarnings.length} user(s) have leave warnings.`
        : `Imported ${result.success} users successfully.`,
      totalRows: rows.length + errors.length,
      successCount: result.success,
      failedCount: result.failed,
      leaveWarningCount: result.leaveWarnings.length,
      errors: [...errors, ...result.errors],
      leaveWarnings: result.leaveWarnings
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await FileUploadService.cleanupTempFile(file.path);
    connection.release();
  }
});
