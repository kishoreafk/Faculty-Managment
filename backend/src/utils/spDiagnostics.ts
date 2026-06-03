/**
 * Shared helper to parse the diagnostic result set from
 * `sp_assign_default_leaves`. The SP emits one diagnostic row with
 * status, message, rules_total, rules_matched, balances_inserted,
 * and skipped_zero fields.
 */

export type SpDiagnostic = {
  status: string;
  message: string;
  rules_total: number;
  rules_matched: number;
  balances_inserted: number;
  skipped_zero: number;
};

/**
 * Parse the multi-resultset output of `CALL sp_assign_default_leaves(?)`
 * and extract the diagnostic row.
 *
 * Returns `undefined` if no diagnostic row was found in the results.
 */
export const parseSpDiagnostic = (spResult: any): SpDiagnostic | undefined => {
  const rows = Array.isArray(spResult) && Array.isArray(spResult[0]) ? spResult[0] : [];
  const diag = rows.find((r: any) => r && typeof r === 'object' && 'status' in r);
  if (!diag) return undefined;
  return {
    status: String(diag.status || 'UNKNOWN'),
    message: String(diag.message || ''),
    rules_total: Number(diag.rules_total || 0),
    rules_matched: Number(diag.rules_matched || 0),
    balances_inserted: Number(diag.balances_inserted || 0),
    skipped_zero: Number(diag.skipped_zero || 0)
  };
};

/**
 * Create an error diagnostic for when the SP itself threw an exception.
 */
export const spErrorDiagnostic = (message: string): SpDiagnostic => ({
  status: 'SP_ERROR',
  message: message || 'Stored procedure raised an error',
  rules_total: 0,
  rules_matched: 0,
  balances_inserted: 0,
  skipped_zero: 0
});

/**
 * Create an unknown diagnostic when the SP returned no diagnostic row.
 */
export const spUnknownDiagnostic = (): SpDiagnostic => ({
  status: 'UNKNOWN',
  message: 'Stored procedure did not return a diagnostic row',
  rules_total: 0,
  rules_matched: 0,
  balances_inserted: 0,
  skipped_zero: 0
});
