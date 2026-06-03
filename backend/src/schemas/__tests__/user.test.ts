import { describe, it, expect } from 'vitest';
import { createUserSchema, updateUserSchema, bulkImportSchema, userIdParam } from '../user';

describe('createUserSchema', () => {
  it('accepts valid create user data', () => {
    const result = createUserSchema.safeParse({
      employee_id: 'EMP001',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'FACULTY',
      faculty_type_id: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts data with all optional fields', () => {
    const result = createUserSchema.safeParse({
      employee_id: 'EMP002',
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'secret123',
      role: 'ADMIN',
      faculty_type_id: 1,
      department: 'Science',
      designation: 'Associate',
      joining_date: '2024-01-01',
      gender: 'FEMALE',
      experience_years: 5,
      qualification: 'PhD',
      force_update: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing employee_id', () => {
    const result = createUserSchema.safeParse({
      name: 'Test', email: 'test@example.com', faculty_type_id: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = createUserSchema.safeParse({
      employee_id: 'EMP003', name: 'Test', email: 'bademail',
      faculty_type_id: 1,
    });
    expect(result.success).toBe(false);
  });

  it('coerces numeric strings', () => {
    const result = createUserSchema.safeParse({
      employee_id: 'EMP004', name: 'Test', email: 'test@example.com',
      role: 'FACULTY', faculty_type_id: '1',
      experience_years: '10',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.faculty_type_id).toBe(1);
      expect(result.data.role).toBe('FACULTY');
      expect(result.data.experience_years).toBe(10);
    }
  });
});

describe('updateUserSchema', () => {
  it('accepts partial update', () => {
    const result = updateUserSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no changes)', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = updateUserSchema.safeParse({ email: 'bademail' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid gender', () => {
    const result = updateUserSchema.safeParse({ gender: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });

  it('rejects negative experience_years', () => {
    const result = updateUserSchema.safeParse({ experience_years: -1 });
    expect(result.success).toBe(false);
  });
});

describe('bulkImportSchema', () => {
  it('accepts valid bulk import rows', () => {
    const result = bulkImportSchema.safeParse({
      rows: [
        { employee_id: 'E1', name: 'Alice', email: 'alice@example.com' },
        { employee_id: 'E2', name: 'Bob', email: 'bob@example.com', department: 'CS' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty rows array', () => {
    const result = bulkImportSchema.safeParse({ rows: [] });
    expect(result.success).toBe(false);
  });

  it('rejects row with missing employee_id', () => {
    const result = bulkImportSchema.safeParse({
      rows: [{ name: 'Alice', email: 'alice@example.com' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects row with invalid email', () => {
    const result = bulkImportSchema.safeParse({
      rows: [{ employee_id: 'E1', name: 'Alice', email: 'not-email' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('userIdParam', () => {
  it('accepts valid numeric id', () => {
    const result = userIdParam.safeParse({ id: 42 });
    expect(result.success).toBe(true);
  });

  it('coerces string id to number', () => {
    const result = userIdParam.safeParse({ id: '42' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(42);
  });

  it('rejects zero id', () => {
    const result = userIdParam.safeParse({ id: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative id', () => {
    const result = userIdParam.safeParse({ id: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric string', () => {
    const result = userIdParam.safeParse({ id: 'abc' });
    expect(result.success).toBe(false);
  });
});
