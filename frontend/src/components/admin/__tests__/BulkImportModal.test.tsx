import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import BulkImportModal from '../BulkImportModal';

const mockCreateObjectURL = vi.fn(() => 'blob:test');
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

vi.mock('../../../api/users', () => ({
  usersApi: {
    bulkImport: vi.fn(),
    downloadSample: vi.fn(() => Promise.resolve({ data: new Blob() })),
  },
}));

beforeEach(() => { vi.clearAllMocks(); });

describe('BulkImportModal', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<BulkImportModal show={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders modal content when show is true', () => {
    const { getByText } = render(<BulkImportModal show={true} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(getByText(/Bulk Import Users/)).toBeDefined();
    expect(getByText(/Download sample template/)).toBeDefined();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    const { getByText } = render(<BulkImportModal show={true} onClose={onClose} onSuccess={vi.fn()} />);
    fireEvent.click(getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('downloads sample file when button clicked', async () => {
    const { getByText } = render(<BulkImportModal show={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const downloadBtn = getByText(/Download sample template/);
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });
});
