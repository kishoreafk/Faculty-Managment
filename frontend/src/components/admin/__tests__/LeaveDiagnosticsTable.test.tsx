import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LeaveDiagnosticsTable from '../LeaveDiagnosticsTable';

const baseItem = {
  leave_type_id: 1,
  leave_type_code: 'ML',
  leave_type_name: 'Medical Leave',
  status: 'OK',
  reason: 'Rule active: 1/MONTHLY',
  rule_present: true,
  accrual_rate: 1,
  accrual_period: 'MONTHLY',
  max_balance: 30,
  balance: 10,
  reserved: 2,
};

describe('LeaveDiagnosticsTable', () => {
  it('renders loading state', () => {
    const { container } = render(<LeaveDiagnosticsTable diagnostics={[]} loading={true} />);
    expect(container.textContent).toContain('Loading');
  });

  it('renders empty state', () => {
    const { container } = render(<LeaveDiagnosticsTable diagnostics={[]} loading={false} />);
    expect(container.textContent).toContain('No diagnostic data');
  });

  it('renders diagnostics rows', () => {
    const { container } = render(<LeaveDiagnosticsTable diagnostics={[baseItem]} loading={false} />);
    expect(container.textContent).toContain('Medical Leave');
    expect(container.textContent).toContain('ML');
    expect(container.textContent).toContain('OK');
    expect(container.textContent).toContain('10');
    expect(container.textContent).toContain('2');
  });

  it('handles NO_RULE status', () => {
    const { container } = render(<LeaveDiagnosticsTable diagnostics={[{ ...baseItem, status: 'NO_RULE', reason: 'No rule defined', rule_present: false, balance: 0, reserved: 0 }]} loading={false} />);
    expect(container.textContent).toContain('NO_RULE');
  });
});
