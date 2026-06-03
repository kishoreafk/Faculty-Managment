import { z } from 'zod';

export const createProductRequestSchema = z.object({
  item_name: z.string().min(1, 'Item name is required'),
  quantity: z.coerce.number().int().positive('Quantity must be positive'),
  reason: z.string().min(1, 'Reason is required')
});

export const reviewProductSchema = z.object({
  action: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().min(1, 'Reason is required for approval/rejection')
});

export const productIdParam = z.object({
  id: z.coerce.number().int().positive('Invalid product request ID')
});
