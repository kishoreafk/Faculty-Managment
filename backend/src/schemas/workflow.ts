import { z } from 'zod';

export const startWorkflowSchema = z.object({
  workflowCode: z.string().min(1, 'Workflow code is required'),
  entityType: z.string().min(1, 'Entity type is required'),
  entityId: z.coerce.number().int().positive('Entity ID is required')
});

export const actOnWorkflowSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'SKIP']),
  comment: z.string().optional()
});

export const workflowInstanceIdParam = z.object({
  instanceId: z.coerce.number().int().positive('Invalid instance ID')
});
