import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import EditUserModal from '../EditUserModal';

const mockUser = {
  id: 1,
  name: 'Test User',
  email: 'test@example.com',
  employee_id: 'EMP001',
  department: 'CS',
  designation: 'Prof',
  faculty_type_id: 1,
  faculty_type_name: 'Teaching',
  gender: 'MALE',
  experience_years: 5,
  qualification: 'PhD',
  role_name: 'FACULTY',
  active: true,
  approved: true,
  imported: false,
  doj: '2024-01-01',
};

vi.mock('../../../api/users', () => ({
  usersApi: {
    update: vi.fn(),
  },
}));

vi.mock('../../../api/auth', () => ({
  authApi: {
    getFacultyTypes: vi.fn(() => Promise.resolve({ data: [{ id: 1, name: 'Teaching' }, { id: 2, name: 'Research' }] })),
  },
}));

import { usersApi } from '../../../api/users';

beforeEach(() => { vi.clearAllMocks(); });

describe('EditUserModal', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<EditUserModal show={false} user={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders user data when show is true', () => {
    const { getByText, container } = render(
      <EditUserModal show={true} user={mockUser} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    expect(getByText(/Test User/)).toBeDefined();
    expect(container.querySelector('input[value="test@example.com"]')).toBeDefined();
  });

  it('shows locked warning for imported users', () => {
    const { getByText } = render(
      <EditUserModal show={true} user={{ ...mockUser, imported: true }} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    expect(getByText(/imported/)).toBeDefined();
  });

  it('calls usersApi.update on save', async () => {
    vi.mocked(usersApi.update).mockResolvedValue({ data: {} });
    const onSaved = vi.fn();
    const onClose = vi.fn();

    const { getByText } = render(
      <EditUserModal show={true} user={mockUser} onClose={onClose} onSaved={onSaved} />
    );

    fireEvent.click(getByText('Save'));
    await waitFor(() => {
      expect(usersApi.update).toHaveBeenCalledWith(1, expect.any(Object));
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    const { getByText } = render(
      <EditUserModal show={true} user={mockUser} onClose={onClose} onSaved={vi.fn()} />
    );

    fireEvent.click(getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
