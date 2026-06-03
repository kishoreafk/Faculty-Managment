import { z } from 'zod';

export const createUserSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  role: z.string().optional().default('FACULTY'),
  faculty_type_id: z.coerce.number().int().positive('Faculty type is required'),
  department: z.string().optional(),
  designation: z.string().optional(),
  joining_date: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  experience_years: z.coerce.number().int().min(0).optional(),
  qualification: z.string().optional(),
  force_update: z.boolean().optional()
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  faculty_type_id: z.coerce.number().int().positive().optional(),
  doj: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  experience_years: z.coerce.number().int().min(0).optional(),
  qualification: z.string().optional(),
  active: z.boolean().optional(),
  role_id: z.coerce.number().int().positive().optional(),
  force_update: z.boolean().optional()
});

export const bulkImportSchema = z.object({
  rows: z.array(z.object({
    employee_id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
    department: z.string().optional()
  })).min(1, 'At least one row is required')
});

export const userIdParam = z.object({
  id: z.coerce.number().int().positive('Invalid user ID')
});
