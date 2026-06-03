import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  code: z.string().min(1, 'Code is required').max(50).optional(),
  org_id: z.coerce.number().int().positive('Organization is required'),
  campus_id: z.coerce.number().int().positive('Campus is required').optional(),
  description: z.string().max(500).optional()
});

export const departmentIdParam = z.object({
  id: z.coerce.number().int().positive('Invalid department ID')
});
