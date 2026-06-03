import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({ pool: {} }));
vi.mock('../../repositories/VaultFileRepository.js', () => ({
  vaultFileRepository: { findById: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));

import { FileUploadService } from '../FileUploadService';
import { vaultFileRepository } from '../../repositories/VaultFileRepository.js';
import fsp from 'fs/promises';

beforeEach(() => { vi.clearAllMocks(); });

describe('uploadFile', () => {
  it('creates a file record and returns it', async () => {
    const mockFile = { originalname: 'doc.pdf', filename: 'abc123.pdf', path: '/uploads/abc123.pdf', mimetype: 'application/pdf', size: 1024 } as Express.Multer.File;
    const mockReq = { user: { id: 1 } } as any;

    vi.mocked(vaultFileRepository.create).mockResolvedValue(99);
    vi.mocked(vaultFileRepository.findById).mockResolvedValue({ id: 99, original_name: 'doc.pdf' } as any);

    const result = await FileUploadService.uploadFile(mockReq, mockFile, { category: 'docs' });

    expect(vaultFileRepository.create).toHaveBeenCalledWith({
      faculty_id: 1,
      original_name: 'doc.pdf',
      stored_name: 'abc123.pdf',
      file_path: '/uploads/abc123.pdf',
      mime_type: 'application/pdf',
      file_size: 1024,
      category: 'docs',
      visibility: 'PRIVATE',
      department: null,
    });
    expect(result).toEqual({ id: 99, original_name: 'doc.pdf' });
  });

  it('uses PUBLIC visibility when specified', async () => {
    const mockFile = { originalname: 'pub.pdf', filename: 'pub.pdf', path: '/pub.pdf', mimetype: 'application/pdf', size: 100 } as Express.Multer.File;
    const mockReq = { user: { id: 1 } } as any;

    vi.mocked(vaultFileRepository.create).mockResolvedValue(1);
    vi.mocked(vaultFileRepository.findById).mockResolvedValue({ id: 1 } as any);

    await FileUploadService.uploadFile(mockReq, mockFile, { visibility: 'PUBLIC' });

    expect(vaultFileRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'PUBLIC' })
    );
  });
});

describe('ensureUploadDir', () => {
  it('creates directory if it does not exist', async () => {
    const mkdirSpy = vi.spyOn(fsp, 'mkdir').mockResolvedValue(undefined as any);

    await FileUploadService.ensureUploadDir('/new/dir');
    expect(mkdirSpy).toHaveBeenCalledWith('/new/dir', { recursive: true });

    mkdirSpy.mockRestore();
  });

  it('skips creation if directory exists', async () => {
    const mkdirSpy = vi.spyOn(fsp, 'mkdir').mockRejectedValue({ code: 'EEXIST' });

    await FileUploadService.ensureUploadDir('/existing/dir');
    expect(mkdirSpy).toHaveBeenCalledWith('/existing/dir', { recursive: true });

    mkdirSpy.mockRestore();
  });
});

describe('cleanupTempFile', () => {
  it('deletes file if it exists', async () => {
    const unlinkSpy = vi.spyOn(fsp, 'unlink').mockResolvedValue(undefined as any);

    await FileUploadService.cleanupTempFile('/tmp/file.pdf');
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/file.pdf');

    unlinkSpy.mockRestore();
  });

  it('skips if path is undefined and silently fails if file does not exist', async () => {
    const unlinkSpy = vi.spyOn(fsp, 'unlink').mockRejectedValue({ code: 'ENOENT' });

    await FileUploadService.cleanupTempFile(undefined);
    expect(unlinkSpy).not.toHaveBeenCalled();

    await FileUploadService.cleanupTempFile('/nonexistent');
    expect(unlinkSpy).toHaveBeenCalledWith('/nonexistent');

    unlinkSpy.mockRestore();
  });
});
