import { pool } from '../config/database.js';
import { LeaveDiagnostic } from '../types/models.js';
import { LEAVE_DIAGNOSTIC_STATUS } from '../constants/index.js';

export class LeaveDiagnosticService {
  static async computeForFaculty(facultyId: number): Promise<LeaveDiagnostic[]> {
    const [users]: any = await pool.execute(
      'SELECT * FROM faculty WHERE id = ? LIMIT 1',
      [facultyId]
    );
    if (!users[0]) return [];

    const user = users[0];
    const facultyTypeId = Number(user.faculty_type_id);
    const userGender = (user.gender || null) as string | null;

    const [allLeaveTypes]: any = await pool.execute(
      'SELECT id, name, code, gender_restriction, active FROM leave_types WHERE active = TRUE'
    );

    const [applicableRules]: any = await pool.execute(
      `SELECT lr.*, lt.code AS leave_type_code, lt.name AS leave_type_name
       FROM leave_rules lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.faculty_type_id = ?`,
      [facultyTypeId]
    );

    const [balances]: any = await pool.execute(
      `SELECT lb.*, lt.name, lt.code, lt.gender_restriction
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.faculty_id = ? AND lb.year = YEAR(CURDATE())`,
      [facultyId]
    );

    const balanceByLeaveTypeId = new Map<number, any>();
    (balances as any[]).forEach((b: any) => balanceByLeaveTypeId.set(Number(b.leave_type_id), b));

    const ruleByLeaveTypeId = new Map<number, any>();
    (applicableRules as any[]).forEach((r: any) => ruleByLeaveTypeId.set(Number(r.leave_type_id), r));

    const serviceMonths = user.doj ? Math.max(0, Math.floor(
      (Date.now() - new Date(user.doj).getTime()) / (1000 * 60 * 60 * 24 * 30.4375)
    )) : null;

    return (allLeaveTypes as any[]).map((lt: any) => {
      const rule = ruleByLeaveTypeId.get(Number(lt.id));
      const balance = balanceByLeaveTypeId.get(Number(lt.id));
      const ltGender = String(lt.gender_restriction || 'ALL').toUpperCase();

      if (ltGender !== 'ALL' && userGender && ltGender !== String(userGender).toUpperCase()) {
        return {
          leave_type_id: lt.id,
          leave_type_code: lt.code,
          leave_type_name: lt.name,
          status: LEAVE_DIAGNOSTIC_STATUS.GENDER_RESTRICTED,
          reason: `Restricted to ${ltGender} faculty, but user gender is ${userGender}.`,
          rule_present: !!rule,
          balance: balance ? Number(balance.balance || 0) : 0,
          reserved: balance ? Number(balance.reserved || 0) : 0
        };
      }

      if (!rule) {
        return {
          leave_type_id: lt.id,
          leave_type_code: lt.code,
          leave_type_name: lt.name,
          status: LEAVE_DIAGNOSTIC_STATUS.NO_RULE,
          reason: `No leave rule defined for faculty_type_id=${facultyTypeId} and leave_type ${lt.code}.`,
          rule_present: false,
          balance: balance ? Number(balance.balance || 0) : 0,
          reserved: balance ? Number(balance.reserved || 0) : 0
        };
      }

      if (rule.probation_excluded && (serviceMonths === null || serviceMonths < 6)) {
        return {
          leave_type_id: lt.id,
          leave_type_code: lt.code,
          leave_type_name: lt.name,
          status: LEAVE_DIAGNOSTIC_STATUS.PROBATION_EXCLUDED,
          reason: `Probation period in effect (service months: ${serviceMonths ?? 'unknown'}).`,
          rule_present: true,
          accrual_rate: Number(rule.accrual_rate),
          accrual_period: rule.accrual_period,
          max_balance: rule.max_balance !== null ? Number(rule.max_balance) : null,
          balance: balance ? Number(balance.balance || 0) : 0,
          reserved: balance ? Number(balance.reserved || 0) : 0
        };
      }

      if (rule.min_service_months > 0 && (serviceMonths === null || serviceMonths < rule.min_service_months)) {
        return {
          leave_type_id: lt.id,
          leave_type_code: lt.code,
          leave_type_name: lt.name,
          status: LEAVE_DIAGNOSTIC_STATUS.MIN_SERVICE_NOT_MET,
          reason: `Minimum ${rule.min_service_months} months required, has ${serviceMonths ?? 'unknown'}.`,
          rule_present: true,
          accrual_rate: Number(rule.accrual_rate),
          accrual_period: rule.accrual_period,
          max_balance: rule.max_balance !== null ? Number(rule.max_balance) : null,
          balance: balance ? Number(balance.balance || 0) : 0,
          reserved: balance ? Number(balance.reserved || 0) : 0
        };
      }

      return {
        leave_type_id: lt.id,
        leave_type_code: lt.code,
        leave_type_name: lt.name,
        status: LEAVE_DIAGNOSTIC_STATUS.OK,
        reason: `Rule active: ${Number(rule.accrual_rate)}/${rule.accrual_period}`,
        rule_present: true,
        accrual_rate: Number(rule.accrual_rate),
        accrual_period: rule.accrual_period,
        max_balance: rule.max_balance !== null ? Number(rule.max_balance) : null,
        balance: balance ? Number(balance.balance || 0) : 0,
        reserved: balance ? Number(balance.reserved || 0) : 0
      };
    });
  }
}
