import { z } from 'zod';

export const submitFormSchema = z.object({
  form_id: z.coerce.number().int().positive('Form ID is required'),
  category: z.string().min(1, 'Category is required'),
  payload: z.any().optional()
});
