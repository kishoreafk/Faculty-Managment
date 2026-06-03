import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { AuditService } from './AuditService.js';

/**
 * Leave rule service.
 *
 * The new `rule_conditions` + `rule_actions` shape is the source of truth
 * for "what does this rule do for whom". The legacy columns on
 * `leave_rules` are kept for backward compatibility and are populated
 * from the new shape when a rule is created or updated.
 *
 * Callers can either:
 *   - use the stored procedure `sp_assign_default_leaves` (legacy)
 *   - call `LeaveRuleService.evaluateForFaculty()` (new) and apply
 *     the resulting action list themselves.
 */
export type Operator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN' | 'NOT_IN' | 'CONTAINS';

export interface RuleCondition {
  id: number;
  rule_id: number;
  field_name: string;
  operator: Operator;
  value: string;
}

export interface RuleAction {
  id: number;
  rule_id: number;
  action_type: string;
  action_value: string;
}

export interface EvaluatedRule {
  ruleId: number;
  facultyTypeId: number;
  leaveTypeId: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  /** True iff every condition's operator evaluates to true against the profile. */
  matched: boolean;
  /** Convenience map of action_type -> parsed action_value. */
  actionMap: Record<string, string | number | boolean>;
}

export interface FacultyProfile {
  id: number;
  facultyTypeId: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  doj: Date | string | null;
  serviceMonths?: number;
  experienceYears?: number;
  qualification?: string | null;
  departmentId?: number | null;
}

export class LeaveRuleService {
  /** Load the conditions+actions for a single rule, as the new shape. */
  static async getRule(ruleId: number): Promise<EvaluatedRule | null> {
    const [rules]: any = await pool.execute(
      `SELECT id, faculty_type_id, leave_type_id FROM leave_rules WHERE id = ? LIMIT 1`,
      [ruleId]
    );
    if (!rules[0]) return null;
    const [conds] = await pool.execute<any[]>(
      `SELECT id, rule_id, field_name, operator, value FROM rule_conditions WHERE rule_id = ?`,
      [ruleId]
    );
    const [acts] = await pool.execute<any[]>(
      `SELECT id, rule_id, action_type, action_value FROM rule_actions WHERE rule_id = ?`,
      [ruleId]
    );
    return LeaveRuleService.buildEvaluated(rules[0], conds, acts);
  }

  /**
   * Find all rules applicable to a (facultyType, leaveType) pair and
   * return the one that matches the given profile, plus the full list
   * of actions for that rule.
   */
  static async evaluateForFaculty(profile: FacultyProfile, leaveTypeId: number): Promise<EvaluatedRule[]> {
    const [rules]: any = await pool.execute(
      `SELECT id, faculty_type_id, leave_type_id FROM leave_rules
       WHERE faculty_type_id = ? AND leave_type_id = ?`,
      [profile.facultyTypeId, leaveTypeId]
    );
    if (rules.length === 0) return [];

    const out: EvaluatedRule[] = [];
    for (const r of rules) {
      const [conds] = await pool.execute<any[]>(
        `SELECT id, rule_id, field_name, operator, value FROM rule_conditions WHERE rule_id = ?`,
        [r.id]
      );
      const [acts] = await pool.execute<any[]>(
        `SELECT id, rule_id, action_type, action_value FROM rule_actions WHERE rule_id = ?`,
        [r.id]
      );
      const evaluated = LeaveRuleService.buildEvaluated(r, conds, acts);
      evaluated.matched = LeaveRuleService.evaluateConditions(evaluated.conditions, profile);
      out.push(evaluated);
    }
    return out;
  }

  /**
   * Compute accrual amount for a (profile, leaveType) pair using the
   * matching rule's actions. Falls back to the legacy columns on
   * `leave_rules` if the new shape has no rules (during the migration
   * window). Returns null if no rule applies.
   */
  static async getAccrualAmount(profile: FacultyProfile, leaveTypeId: number, asOfDate = new Date()): Promise<number | null> {
    // Try the new shape first.
    const evaluated = await LeaveRuleService.evaluateForFaculty(profile, leaveTypeId);
    const matched = evaluated.find((r) => r.matched);
    let rate: number | null = matched && 'ACCRUAL_RATE' in matched.actionMap
      ? Number(matched.actionMap.ACCRUAL_RATE)
      : null;
    let period: string | null = matched && 'ACCRUAL_PERIOD' in matched.actionMap
      ? String(matched.actionMap.ACCRUAL_PERIOD)
      : null;

    // Fallback: legacy columns.
    if (rate === null || period === null) {
      const [rows]: any = await pool.execute(
        `SELECT accrual_rate, accrual_period FROM leave_rules
         WHERE faculty_type_id = ? AND leave_type_id = ? LIMIT 1`,
        [profile.facultyTypeId, leaveTypeId]
      );
      if (rows[0]) {
        if (rate === null) rate = Number(rows[0].accrual_rate);
        if (period === null) period = String(rows[0].accrual_period);
      }
    }
    if (rate === null || period === null) return null;
    return LeaveRuleService.computeAccrual(rate, period, profile, asOfDate);
  }

  /**
   * Snapshot the current state of a rule into a new version row.
   * The new version is effective from `effectiveFrom` (default today).
   */
  static async publishNewVersion(req: AuthRequest, ruleId: number, opts: { effectiveFrom?: Date; note?: string } = {}): Promise<{ versionId: number; version: number }> {
    const [[latest]]: any = await pool.execute(
      `SELECT COALESCE(MAX(version), 0) AS v FROM leave_rule_versions WHERE rule_base_id = ?`,
      [ruleId]
    );
    const nextVersion = Number(latest.v) + 1;
    const effectiveFrom = opts.effectiveFrom ?? new Date();

    const [ins]: any = await pool.execute(
      `INSERT INTO leave_rule_versions (rule_base_id, version, effective_from, note)
       VALUES (?, ?, ?, ?)`,
      [ruleId, nextVersion, effectiveFrom, opts.note ?? null]
    );
    const versionId = Number(ins.insertId);

    // Copy the current rule_conditions + rule_actions into the version snapshot.
    const [conds] = await pool.execute<any[]>(
      `SELECT field_name, operator, value FROM rule_conditions WHERE rule_id = ?`,
      [ruleId]
    );
    for (const c of conds) {
      await pool.execute(
        `INSERT INTO leave_rule_version_actions
           (version_id, condition_field, condition_operator, condition_value, action_type, action_value)
         SELECT ?, ?, ?, ?, action_type, action_value
         FROM rule_actions WHERE rule_id = ?`,
        [versionId, c.field_name, c.operator, c.value, ruleId]
      );
    }

    await AuditService.logFromRequest(req, {
      action: 'leave_rule.versioned',
      entityType: 'leave_rule',
      entityId: ruleId,
      entityLabel: `rule#${ruleId} v${nextVersion}`,
      afterState: { versionId, version: nextVersion, effectiveFrom }
    });

    return { versionId, version: nextVersion };
  }

  /** Look up the version of a rule effective at a given date. */
  static async getEffectiveVersion(ruleId: number, asOfDate: Date): Promise<{ versionId: number; version: number; actions: any[] } | null> {
    const [rows]: any = await pool.execute(
      `SELECT id, version FROM leave_rule_versions
       WHERE rule_base_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY version DESC LIMIT 1`,
      [ruleId, asOfDate, asOfDate]
    );
    if (!rows[0]) return null;
    const [actions] = await pool.execute<any[]>(
      `SELECT condition_field, condition_operator, condition_value, action_type, action_value
       FROM leave_rule_version_actions WHERE version_id = ?`,
      [rows[0].id]
    );
    return { versionId: rows[0].id, version: rows[0].version, actions };
  }

  // ---- internals ----

  private static buildEvaluated(ruleRow: any, conds: RuleCondition[], acts: RuleAction[]): EvaluatedRule {
    const actionMap: Record<string, string | number | boolean> = {};
    for (const a of acts) {
      const v = a.action_value;
      const lower = v.toLowerCase();
      if (lower === 'true') actionMap[a.action_type] = true;
      else if (lower === 'false') actionMap[a.action_type] = false;
      else if (/^-?\d+(\.\d+)?$/.test(v)) actionMap[a.action_type] = Number(v);
      else actionMap[a.action_type] = v;
    }
    return {
      ruleId: ruleRow.id,
      facultyTypeId: ruleRow.faculty_type_id,
      leaveTypeId: ruleRow.leave_type_id,
      conditions: conds,
      actions: acts,
      matched: false,
      actionMap
    };
  }

  private static evaluateConditions(conds: RuleCondition[], profile: FacultyProfile): boolean {
    if (conds.length === 0) return true; // no constraints → always matches
    for (const c of conds) {
      const fieldValue = LeaveRuleService.profileField(profile, c.field_name);
      if (!LeaveRuleService.compare(fieldValue, c.operator, c.value)) return false;
    }
    return true;
  }

  private static profileField(profile: FacultyProfile, name: string): unknown {
    switch (name) {
      case 'faculty_type_id': return profile.facultyTypeId;
      case 'gender':          return profile.gender;
      case 'department_id':   return profile.departmentId;
      case 'qualification':   return profile.qualification;
      case 'experience_years': return profile.experienceYears;
      case 'service_months': {
        if (profile.serviceMonths !== undefined) return profile.serviceMonths;
        if (!profile.doj) return 0;
        const doj = profile.doj instanceof Date ? profile.doj : new Date(profile.doj);
        return Math.max(0, Math.floor((Date.now() - doj.getTime()) / (1000 * 60 * 60 * 24 * 30)));
      }
      default: return undefined;
    }
  }

  private static compare(field: unknown, op: Operator, rawValue: string): boolean {
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const value = rawValue.trim();
    switch (op) {
      case '=':
        if (num(field) !== null && /^-?\d+(\.\d+)?$/.test(value)) return num(field) === Number(value);
        return String(field) === value;
      case '!=':
        return String(field) !== value;
      case '>':  return (num(field) ?? -Infinity) >  Number(value);
      case '>=': return (num(field) ?? -Infinity) >= Number(value);
      case '<':  return (num(field) ??  Infinity) <  Number(value);
      case '<=': return (num(field) ??  Infinity) <= Number(value);
      case 'IN': {
        const set = value.split(',').map((s) => s.trim()).filter(Boolean);
        if (num(field) !== null) return set.map(Number).includes(num(field)!);
        return set.includes(String(field));
      }
      case 'NOT_IN': {
        const set = value.split(',').map((s) => s.trim()).filter(Boolean);
        if (num(field) !== null) return !set.map(Number).includes(num(field)!);
        return !set.includes(String(field));
      }
      case 'CONTAINS':
        return String(field ?? '').includes(value);
      default:
        throw new AppError(500, 'UNKNOWN_OPERATOR', `Unknown operator ${op}`);
    }
  }

  private static computeAccrual(rate: number, period: string, profile: FacultyProfile, asOf: Date): number {
    const doj = profile.doj ? (profile.doj instanceof Date ? profile.doj : new Date(profile.doj)) : asOf;
    switch (period) {
      case 'DAILY':
        return rate * Math.max(0, Math.floor((asOf.getTime() - doj.getTime()) / 86_400_000));
      case 'MONTHLY': {
        const months = Math.max(0, LeaveRuleService.monthsBetween(doj, asOf));
        return rate * months;
      }
      case 'YEARLY': {
        const years = Math.max(0, (asOf.getFullYear() - doj.getFullYear()));
        return rate * years;
      }
      case 'ONE_TIME':
        return rate;
      default:
        return 0;
    }
  }

  private static monthsBetween(a: Date, b: Date): number {
    return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
  }
}
