import { z } from 'zod';

export const createTimetableSchema = z.object({
  course_id: z.coerce.number().int().positive('Course is required'),
  faculty_id: z.coerce.number().int().positive('Faculty is required'),
  day_of_week: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().min(1, 'End time is required'),
  room_no: z.string().optional(),
  mode: z.enum(['OFFLINE', 'ONLINE']).optional().default('OFFLINE')
});

export const updateTimetableSchema = createTimetableSchema;

export const timetableIdParam = z.object({
  id: z.coerce.number().int().positive('Invalid timetable ID')
});
