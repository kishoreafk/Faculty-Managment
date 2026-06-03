import { z } from 'zod';

export const assignTimetableSchema = z.object({
  facultyId: z.coerce.number().int().positive('Faculty ID is required'),
  fileId: z.coerce.number().int().positive('File ID is required')
});

export const unassignTimetableSchema = z.object({
  facultyId: z.coerce.number().int().positive('Faculty ID is required')
});

export const timetableFileIdParam = z.object({
  id: z.coerce.number().int().positive('Invalid timetable file ID')
});
