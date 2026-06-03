import { describe, it, expect } from 'vitest';
import { PRIVILEGED_ROLES, isPrivileged, isValidRole, isValidGender, ROLES, GENDER, LEAVE_STATUS, PRODUCT_STATUS, VISIBILITY, ACCRUAL_PERIOD, LEAVE_CATEGORY, LEAVE_DIAGNOSTIC_STATUS } from '../index';

describe('constants', () => {
  it('defines all roles', () => {
    expect(ROLES.FACULTY).toBe('FACULTY');
    expect(ROLES.HOD).toBe('HOD');
    expect(ROLES.ADMIN).toBe('ADMIN');
    expect(ROLES.SUPER_ADMIN).toBe('SUPER_ADMIN');
  });

  it('PRIVILEGED_ROLES contains ADMIN, SUPER_ADMIN, HOD', () => {
    expect(PRIVILEGED_ROLES).toContain('ADMIN');
    expect(PRIVILEGED_ROLES).toContain('SUPER_ADMIN');
    expect(PRIVILEGED_ROLES).toContain('HOD');
    expect(PRIVILEGED_ROLES).not.toContain('FACULTY');
  });

  it('isPrivileged returns true for admin roles', () => {
    expect(isPrivileged('ADMIN')).toBe(true);
    expect(isPrivileged('SUPER_ADMIN')).toBe(true);
    expect(isPrivileged('HOD')).toBe(true);
  });

  it('isPrivileged returns false for faculty or null', () => {
    expect(isPrivileged('FACULTY')).toBe(false);
    expect(isPrivileged(null)).toBe(false);
    expect(isPrivileged(undefined)).toBe(false);
    expect(isPrivileged('')).toBe(false);
  });

  it('isValidRole validates roles', () => {
    expect(isValidRole('FACULTY')).toBe(true);
    expect(isValidRole('ADMIN')).toBe(true);
    expect(isValidRole('UNKNOWN')).toBe(false);
  });

  it('isValidGender validates genders', () => {
    expect(isValidGender('MALE')).toBe(true);
    expect(isValidGender('FEMALE')).toBe(true);
    expect(isValidGender('OTHER')).toBe(true);
    expect(isValidGender('UNKNOWN')).toBe(false);
  });
});

describe('leave status constants', () => {
  it('has PENDING, APPROVED, REJECTED, DELETED', () => {
    expect(LEAVE_STATUS.PENDING).toBe('PENDING');
    expect(LEAVE_STATUS.APPROVED).toBe('APPROVED');
    expect(LEAVE_STATUS.REJECTED).toBe('REJECTED');
    expect(LEAVE_STATUS.DELETED).toBe('DELETED');
  });

  it('matches product status values', () => {
    expect(PRODUCT_STATUS.PENDING).toBe('PENDING');
    expect(PRODUCT_STATUS.APPROVED).toBe('APPROVED');
  });
});

describe('diagnostic status constants', () => {
  it('has all expected diagnostic statuses', () => {
    expect(LEAVE_DIAGNOSTIC_STATUS.OK).toBe('OK');
    expect(LEAVE_DIAGNOSTIC_STATUS.NO_RULE).toBe('NO_RULE');
    expect(LEAVE_DIAGNOSTIC_STATUS.GENDER_RESTRICTED).toBe('GENDER_RESTRICTED');
    expect(LEAVE_DIAGNOSTIC_STATUS.PROBATION_EXCLUDED).toBe('PROBATION_EXCLUDED');
    expect(LEAVE_DIAGNOSTIC_STATUS.MIN_SERVICE_NOT_MET).toBe('MIN_SERVICE_NOT_MET');
    expect(LEAVE_DIAGNOSTIC_STATUS.FACULTY_NOT_FOUND).toBe('FACULTY_NOT_FOUND');
    expect(LEAVE_DIAGNOSTIC_STATUS.SP_ERROR).toBe('SP_ERROR');
  });
});
