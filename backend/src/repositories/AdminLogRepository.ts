import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { BaseRepository } from './BaseRepository.js';
import { AdminLog } from '../types/models.js';

interface AdminLogRow extends RowDataPacket, AdminLog {}

export class AdminLogRepository extends BaseRepository<AdminLogRow> {
  constructor() {
    super('admin_logs');
  }

  async findWithFilters(filters: {
    adminId?: number;
    actionType?: string;
    resourceType?: string;
    from?: string;
    to?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: AdminLog[]; total: number }> {
    const where: string[] = ['1=1'];
    const params: any[] = [];

    if (filters.adminId) { where.push('admin_id = ?'); params.push(filters.adminId); }
    if (filters.actionType) { where.push('action_type = ?'); params.push(filters.actionType); }
    if (filters.resourceType) { where.push('resource_type = ?'); params.push(filters.resourceType); }
    if (filters.from) { where.push('created_at >= ?'); params.push(filters.from); }
    if (filters.to) { where.push('created_at <= ?'); params.push(filters.to); }

    const whereClause = where.join(' AND ');
    const [[{ total }]] = await pool.query<any[]>(
      `SELECT COUNT(*) AS total FROM admin_logs WHERE ${whereClause}`,
      params
    );

    const [rows] = await pool.query<AdminLogRow[]>(
      `SELECT * FROM admin_logs WHERE ${whereClause} ORDER BY created_at DESC LIMIT ${filters.limit} OFFSET ${filters.offset}`,
      params
    );

    return { rows, total: Number(total) };
  }
}

export const adminLogRepository = new AdminLogRepository();
