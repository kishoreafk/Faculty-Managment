export const ROLES = {
  FACULTY: 'FACULTY',
  HOD: 'HOD',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export const LEAVE_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DELETED: 'DELETED',
} as const;

export const PRODUCT_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DELETED: 'DELETED',
} as const;

export const GENDER = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
} as const;

export const VISIBILITY = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
  DEPARTMENT: 'DEPARTMENT',
} as const;

export const ACCRUAL_PERIOD = {
  DAILY: 'DAILY',
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
  ONE_TIME: 'ONE_TIME',
} as const;

export const LEAVE_CATEGORY = {
  FULL_DAY: 'FULL_DAY',
  HALF_DAY: 'HALF_DAY',
  SHORT_LEAVE: 'SHORT_LEAVE',
} as const;

export const LEAVE_DIAGNOSTIC_STATUS = {
  OK: 'OK',
  NO_RULE: 'NO_RULE',
  GENDER_RESTRICTED: 'GENDER_RESTRICTED',
  PROBATION_EXCLUDED: 'PROBATION_EXCLUDED',
  MIN_SERVICE_NOT_MET: 'MIN_SERVICE_NOT_MET',
  SP_ERROR: 'SP_ERROR',
  NO_RULES_DEFINED: 'NO_RULES_DEFINED',
  FACULTY_NOT_FOUND: 'FACULTY_NOT_FOUND',
  UNKNOWN: 'UNKNOWN',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
export type LeaveStatus = (typeof LEAVE_STATUS)[keyof typeof LEAVE_STATUS];
export type Gender = (typeof GENDER)[keyof typeof GENDER];
export type Visibility = (typeof VISIBILITY)[keyof typeof VISIBILITY];

export const PRIVILEGED_ROLES: readonly string[] = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.HOD];

export const isPrivileged = (role?: string | null): boolean =>
  role !== null && role !== undefined && PRIVILEGED_ROLES.includes(role);

export const isValidRole = (role: string): boolean =>
  Object.values(ROLES).includes(role as any);

export const isValidGender = (gender: string): boolean =>
  Object.values(GENDER).includes(gender as any);
