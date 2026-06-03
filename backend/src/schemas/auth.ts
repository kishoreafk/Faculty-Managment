import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

export const registerSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  faculty_type_id: z.coerce.number().int().positive('Faculty type is required'),
  department: z.string().optional(),
  designation: z.string().optional(),
  doj: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional()
});
