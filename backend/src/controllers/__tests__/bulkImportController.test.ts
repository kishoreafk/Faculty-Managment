import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPool, mockBulkImportService, mockFileUploadService } = vi.hoisted(() => ({
  mockPool: { execute: vi.fn(), getConnection: vi.fn() },
  mockBulkImportService: { parseExcel: vi.fn(), importUsers: vi.fn() },
  mockFileUploadService: { cleanupTempFile: vi.fn() },
}));

vi.mock('../../config/database.js', () => ({ pool: mockPool }));
vi.mock('../../services/BulkImportService.js', () => ({ BulkImportService: mockBulkImportService }));
vi.mock('../../services/FileUploadService.js', () => ({ FileUploadService: mockFileUploadService }));
vi.mock('../../services/AuditService.js', () => ({ AuditService: { logFromRequest: vi.fn() } }));
vi.mock('../../utils/emailTemplates.js', () => ({
  sendBulkImportWelcomeEmail: vi.fn(() => Promise.resolve()),
}));

// Mock asyncHandler to be transparent so we get the promise back for await
vi.mock('../../middleware/errorHandler.js', async () => {
  const actual = await vi.importActual<any>('../../middleware/errorHandler.js');
  return {
    ...actual,
    asyncHandler: <T extends (...args: any[]) => any>(fn: T) => fn,
  };
});

beforeEach(() => { vi.clearAllMocks(); });

import { downloadSampleExcel, bulkImportUsers } from '../bulkImportController.js';

function mockReq(overrides = {}) {
  return { user: { id: 1, role: 'ADMIN' }, params: {}, body: {}, ip: '127.0.0.1', get: vi.fn(), ...overrides } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.setHeader = vi.fn(() => res);
  res.send = vi.fn(() => res);
  return res;
}

describe('downloadSampleExcel', () => {
  it('sends xlsx buffer with correct headers', async () => {
    const req = mockReq();
    const res = mockRes(); const next = vi.fn();
    mockPool.execute.mockResolvedValueOnce([
      [
        { id: 1, name: 'Assistant Professor', category: 'Teaching' },
        { id: 2, name: 'Associate Professor', category: 'Teaching' },
        { id: 3, name: 'Professor', category: 'Teaching' },
        { id: 4, name: 'Lab Assistant', category: 'NonTeaching' },
        { id: 5, name: 'Visiting Faculty', category: 'Visiting' },
        { id: 6, name: 'Contract Faculty', category: 'Contract' }
      ],
      []
    ]);
    await downloadSampleExcel(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="faculty_bulk_import_template.xlsx"');
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });
});

describe('bulkImportUsers', () => {
  it('successfully imports users from file', async () => {
    const req = mockReq({ file: { path: '/tmp/import.xlsx', originalname: 'import.xlsx', size: 1000 } });
    const res = mockRes(); const next = vi.fn();
    const mockConn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    mockBulkImportService.parseExcel.mockResolvedValue({ rows: [{ employee_id: 'E1', name: 'Alice', email: 'alice@test.com' }], errors: [] });
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockBulkImportService.importUsers.mockResolvedValue({ success: 1, failed: 0, errors: [], leaveWarnings: [] });
    await bulkImportUsers(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ successCount: 1 }));
    expect(mockFileUploadService.cleanupTempFile).toHaveBeenCalledWith('/tmp/import.xlsx');
  });

  it('passes error to next when no file uploaded', async () => {
    const req = mockReq();
    const res = mockRes(); const next = vi.fn();
    await expect(bulkImportUsers(req, res, next)).rejects.toThrow();
  });

  it('passes error to next when no valid rows found', async () => {
    const req = mockReq({ file: { path: '/tmp/empty.xlsx', originalname: 'empty.xlsx', size: 100 } });
    const res = mockRes(); const next = vi.fn();
    mockBulkImportService.parseExcel.mockResolvedValue({ rows: [], errors: [{ row: 2, error: 'Missing name' }] });
    await expect(bulkImportUsers(req, res, next)).rejects.toThrow();
    expect(mockFileUploadService.cleanupTempFile).toHaveBeenCalledWith('/tmp/empty.xlsx');
  });

  it('passes error to next and rolls back on import error', async () => {
    const req = mockReq({ file: { path: '/tmp/fail.xlsx', originalname: 'fail.xlsx', size: 500 } });
    const res = mockRes(); const next = vi.fn();
    const mockConn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    mockBulkImportService.parseExcel.mockResolvedValue({ rows: [{ employee_id: 'E1', name: 'Fail', email: 'fail@test.com' }], errors: [] });
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockBulkImportService.importUsers.mockRejectedValue(new Error('Import failed'));
    await expect(bulkImportUsers(req, res, next)).rejects.toThrow('Import failed');
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockFileUploadService.cleanupTempFile).toHaveBeenCalledWith('/tmp/fail.xlsx');
    expect(mockConn.release).toHaveBeenCalled();
  });
});
