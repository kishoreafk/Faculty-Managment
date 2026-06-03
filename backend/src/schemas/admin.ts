import { z } from 'zod';

export const approveFacultyBody = z.object({
  role: z.string().optional()
});

export const facultyIdParam = z.object({
  id: z.coerce.number().int().positive('Invalid faculty ID')
});

export const rejectFacultyBody = z.object({
  reason: z.string().min(1, 'Reason is required').max(500)
});
