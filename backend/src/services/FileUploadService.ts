import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { vaultFileRepository } from '../repositories/VaultFileRepository.js';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

export class FileUploadService {
  static async uploadFile(
    req: AuthRequest,
    file: Express.Multer.File,
    opts: {
      category?: string;
      visibility?: string;
      department?: string | null;
    } = {}
  ): Promise<any> {
    const id = await vaultFileRepository.create({
      faculty_id: req.user!.id,
      original_name: file.originalname,
      stored_name: file.filename,
      file_path: file.path,
      mime_type: file.mimetype,
      file_size: file.size,
      category: opts.category ?? null,
      visibility: opts.visibility ?? 'PRIVATE',
      department: opts.department ?? null
    });
    return vaultFileRepository.findById(id);
  }

  static async deleteFile(fileId: number, req: AuthRequest): Promise<void> {
    const file = await vaultFileRepository.findById(fileId);
    if (!file) throw new AppError(404, 'NOT_FOUND', 'File not found');
    if (file.faculty_id !== req.user!.id && !['ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Not authorized to delete this file');
    }
    try { await fsp.unlink(file.file_path); } catch { /* file may already be gone */ }
    await vaultFileRepository.delete(fileId);
  }

  static async ensureUploadDir(dir: string): Promise<void> {
    try { await fsp.mkdir(dir, { recursive: true }); } catch { /* ignore if exists */ }
  }

  static async cleanupTempFile(filePath: string | undefined): Promise<void> {
    if (filePath) {
      try { await fsp.unlink(filePath); } catch { /* ignore */ }
    }
  }
}
