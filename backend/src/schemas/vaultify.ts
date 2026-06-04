import { z } from 'zod';

export const uploadFileBody = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  category_id: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  visibility: z.enum(['PRIVATE', 'PUBLIC', 'DEPARTMENT']).optional().default('PRIVATE')
});

export const vaultFileIdParam = z.object({
  id: z.coerce.number().int().positive('Invalid file ID')
});
