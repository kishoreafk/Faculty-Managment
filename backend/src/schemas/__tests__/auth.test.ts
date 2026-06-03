import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema } from '../auth';

describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'notanemail', password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('accepts valid registration with all required fields', () => {
    const result = registerSchema.safeParse({
      employee_id: 'EMP001',
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
      faculty_type_id: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts registration with optional fields', () => {
    const result = registerSchema.safeParse({
      employee_id: 'EMP002',
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password123',
      faculty_type_id: 1,
      department: 'Computer Science',
      designation: 'Professor',
      doj: '2024-01-15',
      gender: 'FEMALE',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = registerSchema.safeParse({
      employee_id: 'EMP003',
      name: 'Test',
      email: 'test@example.com',
      password: '12345',
      faculty_type_id: 1,
    });
    expect(result.success).toBe(false);
  });

  it('coerces string faculty_type_id to number', () => {
    const result = registerSchema.safeParse({
      employee_id: 'EMP004',
      name: 'Test',
      email: 'test@example.com',
      password: 'password123',
      faculty_type_id: '2',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.faculty_type_id).toBe(2);
    }
  });

  it('rejects invalid gender', () => {
    const result = registerSchema.safeParse({
      employee_id: 'EMP005',
      name: 'Test',
      email: 'test@example.com',
      password: 'password123',
      faculty_type_id: 1,
      gender: 'INVALID',
    });
    expect(result.success).toBe(false);
  });
});
