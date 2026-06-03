/**
 * Shared file access check for vaultify and timetable files.
 *
 * Usage:
 *   const file = rows[0]; // Must include `department` and `user_department` columns
 *   const access = checkFileAccess(file, userId, userRole);
 */

export type FileAccessResult = {
  allowed: boolean;
  reason?: string;
};

export const checkFileAccess = (
  file: any,
  userId: number,
  userRole?: string
): FileAccessResult => {
  const isOwner = (file.faculty_id ?? file.uploaded_by) === userId;
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
  const isPublic = file.visibility === 'PUBLIC';
  const isDepartment = file.visibility === 'DEPARTMENT' && file.department === file.user_department;

  if (isOwner) return { allowed: true };
  if (isAdmin) return { allowed: true };
  if (isPublic) return { allowed: true };
  if (isDepartment) return { allowed: true };

  return { allowed: false, reason: 'Access denied' };
};
