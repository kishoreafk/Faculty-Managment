import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { BaseRepository } from './BaseRepository.js';
import { TimetableEntry } from '../types/models.js';

interface TimetableRow extends RowDataPacket, TimetableEntry {}

export class TimetableRepository extends BaseRepository<TimetableRow> {
  constructor() {
    super('timetable');
  }

  async findByFaculty(facultyId: number): Promise<TimetableEntry[]> {
    const [rows] = await pool.execute<TimetableRow[]>(
      'SELECT * FROM timetable WHERE faculty_id = ? ORDER BY day_of_week, start_time',
      [facultyId]
    );
    return rows;
  }
}

export const timetableRepository = new TimetableRepository();
