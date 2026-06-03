import { pool } from '../config/database.js';
import { RowDataPacket } from 'mysql2';
import { isProduction } from '../config/env.js';

export const verifyTables = async () => {
  const requiredTables = [
    'vault_files',
    'vault_categories',
    'vault_access_logs',
    'timetable_files',
    'timetable_access_logs'
  ];

  try {
    for (const table of requiredTables) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SHOW TABLES LIKE '${table}'`
      );
      
      if (rows.length === 0) {
        if (!isProduction) console.warn(`[WARN] Table '${table}' does not exist`);
      } else {
        if (!isProduction) console.log(`[OK] Table '${table}' exists`);
      }
    }
  } catch (error) {
    if (!isProduction) console.error('[ERROR] Error verifying tables:', error);
  }
};
