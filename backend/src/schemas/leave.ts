import { z } from 'zod';

export const applyLeaveSchema = z.object({
  leave_type_id: z.coerce.number().int().positive('Leave type is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  total_days: z.coerce.number().positive('Total days must be positive'),
  reason: z.string().min(1, 'Reason is required'),
  leave_category: z.enum(['FULL_DAY', 'HALF_DAY', 'SHORT_LEAVE']).optional().default('FULL_DAY'),
  is_during_exam: z.boolean().optional().default(false),
  contact_during_leave: z.string().optional(),
  remarks: z.string().optional(),
  attachments: z.any().optional(),
  adjustments: z.array(z.any()).optional()
});

export const reviewLeaveSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().min(1, 'Reason is required for approval/rejection')
});

export const leaveStatusParam = z.object({
  id: z.coerce.number().int().positive('Invalid leave ID')
});

export const adjustLeaveParam = z.object({
  id: z.coerce.number().int().positive('Invalid adjustment ID')
});

export const confirmAdjustmentBody = z.object({
  status: z.enum(['CONFIRMED', 'DECLINED']),
  remarks: z.string().optional()
});

export const updateFacultyLeaveBalanceBody = z.object({
  faculty_id: z.coerce.number().int().positive('Faculty ID is required'),
  leave_type_id: z.coerce.number().int().positive('Leave type ID is required'),
  new_balance: z.coerce.number().min(0, 'Balance must be non-negative'),
  reason: z.string().max(500).optional().default('Manual adjustment by admin')
});
