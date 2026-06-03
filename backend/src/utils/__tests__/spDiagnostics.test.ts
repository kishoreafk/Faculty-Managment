import { describe, it, expect } from 'vitest';
import { parseSpDiagnostic, spErrorDiagnostic, spUnknownDiagnostic } from '../spDiagnostics';

describe('parseSpDiagnostic', () => {
  it('parses standard multi-resultset output', () => {
    const result = parseSpDiagnostic([
      [{ status: 'OK', message: 'Success', rules_total: 5, rules_matched: 3, balances_inserted: 3, skipped_zero: 2 }],
    ]);
    expect(result).toBeDefined();
    expect(result!.status).toBe('OK');
    expect(result!.rules_total).toBe(5);
    expect(result!.balances_inserted).toBe(3);
  });

  it('returns undefined for empty result', () => {
    expect(parseSpDiagnostic([])).toBeUndefined();
    expect(parseSpDiagnostic([[{}]])).toBeUndefined();
    expect(parseSpDiagnostic(undefined)).toBeUndefined();
  });

  it('handles diagnostic with missing fields', () => {
    const result = parseSpDiagnostic([
      [{ status: 'ERROR' }],
    ]);
    expect(result).toBeDefined();
    expect(result!.status).toBe('ERROR');
    expect(result!.rules_total).toBe(0);
  });

  it('finds diagnostic row among other rows', () => {
    const result = parseSpDiagnostic([
      [{ some: 'data' }, { status: 'OK', message: 'Found' }],
    ]);
    expect(result).toBeDefined();
    expect(result!.status).toBe('OK');
  });
});

describe('spErrorDiagnostic', () => {
  it('creates error diagnostic with message', () => {
    const d = spErrorDiagnostic('SP crashed');
    expect(d.status).toBe('SP_ERROR');
    expect(d.message).toContain('SP crashed');
  });

  it('uses default message when empty', () => {
    const d = spErrorDiagnostic('');
    expect(d.message).toBe('Stored procedure raised an error');
  });
});

describe('spUnknownDiagnostic', () => {
  it('creates unknown diagnostic', () => {
    const d = spUnknownDiagnostic();
    expect(d.status).toBe('UNKNOWN');
    expect(d.message).toContain('did not return');
  });
});
