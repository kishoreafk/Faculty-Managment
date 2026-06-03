import { z } from 'zod';

export const updateCredentialsSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  forceReset: z.boolean().optional(),
  reason: z.string().optional()
});

export const promoteUserSchema = z.object({
  role: z.string().min(1, 'Role is required')
});

export const idsReasonBody = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, 'At least one ID is required'),
  reason: z.string().min(1, 'Reason is required').max(500)
});

export const reasonBody = z.object({
  reason: z.string().min(1, 'Reason is required').max(500)
});

export const bulkApproveBody = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, 'At least one ID is required')
});

export const reviewActionBody = z.object({
  action: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().min(1, 'Reason is required')
});
