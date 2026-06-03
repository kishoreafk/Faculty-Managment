import { z } from 'zod';

export const createMasterCodeSchema = z.object({
  category: z.string().min(1, 'Category is required').max(100),
  code: z.string().min(1, 'Code is required').max(50),
  name: z.string().min(1, 'Name is required').max(255),
  displayOrder: z.coerce.number().int().min(0).optional()
});
