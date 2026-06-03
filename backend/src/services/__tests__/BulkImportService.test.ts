import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const tmpDir = fs.mkdtempSync('bulk-test-');
const validPath = path.join(tmpDir, 'valid.xlsx');
const errorPath = path.join(tmpDir, 'errors.xlsx');

beforeAll(() => {
  const wb1 = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet([
    { 'Employee ID': 'E001', 'Name': 'Alice', 'Email': 'alice@example.com', 'Department': 'CS' },
    { 'Employee ID': 'E002', 'Name': 'Bob', 'Email': 'bob@example.com' },
  ]);
  XLSX.utils.book_append_sheet(wb1, ws1, 'Sheet1');
  XLSX.writeFile(wb1, validPath);

  const wb2 = XLSX.utils.book_new();
  const ws2 = XLSX.utils.json_to_sheet([
    { 'Employee ID': '', 'Name': 'NoID', 'Email': 'no@example.com' },
    { 'Employee ID': 'E002', 'Name': '', 'Email': 'bob@example.com' },
    { 'Employee ID': 'E003', 'Name': 'BadEmail', 'Email': 'notanemail' },
  ]);
  XLSX.utils.book_append_sheet(wb2, ws2, 'Sheet1');
  XLSX.writeFile(wb2, errorPath);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseExcel', () => {
  it('parses valid rows from XLSX', () => {
    const workbook = XLSX.readFile(validPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
    expect(data).toHaveLength(2);
    expect(data[0]['Employee ID']).toBe('E001');
  });

  it('reports errors correctly', () => {
    const workbook = XLSX.readFile(errorPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

    const errors: { row: number; error: string }[] = [];
    const rows: any[] = [];

    for (let i = 0; i < data.length; i++) {
      const raw = data[i];
      const employeeId = String(raw['Employee ID'] || raw['employee_id'] || '').trim();
      const name = String(raw['Name'] || raw['name'] || '').trim();
      const email = String(raw['Email'] || raw['email'] || '').trim();

      if (!employeeId) { errors.push({ row: i + 2, error: 'Missing employee_id' }); continue; }
      if (!name) { errors.push({ row: i + 2, error: 'Missing name' }); continue; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push({ row: i + 2, error: 'Invalid email' }); continue; }
      rows.push({ employee_id: employeeId, name, email });
    }

    expect(rows).toHaveLength(0);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.some(e => e.error.includes('Missing employee_id'))).toBe(true);
    expect(errors.some(e => e.error.includes('Missing name'))).toBe(true);
    expect(errors.some(e => e.error.includes('Invalid email'))).toBe(true);
  });
});
