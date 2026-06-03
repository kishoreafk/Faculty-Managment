import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { BaseRepository } from './BaseRepository.js';
import { VaultifyFile } from '../types/models.js';

interface VaultFileRow extends RowDataPacket, VaultifyFile {}

export class VaultFileRepository extends BaseRepository<VaultFileRow> {
  constructor() {
    super('vault_files');
  }

  async findByFaculty(facultyId: number, limit = 200, offset = 0): Promise<VaultifyFile[]> {
    const [rows] = await pool.execute<VaultFileRow[]>(
      `SELECT * FROM vault_files WHERE faculty_id = ? ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [facultyId]
    );
    return rows;
  }

  async findAccessible(facultyId: number, department: string | null, role: string, limit = 200, offset = 0): Promise<VaultifyFile[]> {
    const [rows] = await pool.execute<VaultFileRow[]>(
      `SELECT v.*, f.name as uploaded_by_name
       FROM vault_files v
       JOIN faculty f ON v.faculty_id = f.id
       WHERE v.visibility = 'PUBLIC'
          OR v.faculty_id = ?
          OR (v.visibility = 'DEPARTMENT' AND v.department = ?)
          OR (? IN ('ADMIN', 'SUPER_ADMIN'))
       ORDER BY v.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [facultyId, department, role]
    );
    return rows;
  }
}

export const vaultFileRepository = new VaultFileRepository();
