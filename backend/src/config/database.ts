import mysql from 'mysql2/promise';
import { requireEnv } from './env.js';

export const pool = mysql.createPool({
  host: requireEnv('DB_HOST'),
  user: requireEnv('DB_USER'),
  password: requireEnv('DB_PASSWORD'),
  database: requireEnv('DB_NAME'),
  port: Number(requireEnv('DB_PORT')),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

// Debug wrapper: log query/param mismatch errors without
// creating orphaned promise chains. The original promise is
// returned as-is and must be caught by the caller.
const origExecute = pool.execute.bind(pool);
(pool as any).execute = function debugExecute(sql: string, params?: any[]) {
  const promise = origExecute(sql, params as any);
  promise.catch((err: any) => {
    if (err?.errno === 1210 || err?.code === 'ER_WRONG_ARGUMENTS') {
      const qCount = (sql.match(/\?/g) || []).length;
      const pCount = params?.length ?? 0;
      console.error('\n[DEBUG FAILING QUERY] sql:', sql.slice(0, 500));
      console.error('[DEBUG FAILING QUERY] ? count:', qCount, '| params count:', pCount);
      console.error('[DEBUG FAILING QUERY] params:', JSON.stringify(params));
    }
  });
  return promise;
};

const debugDbError = (err: any): string => {
  if (!err) return 'Unknown error';
  if (err.code === 'ECONNREFUSED') return `[DEBUG ERROR] DB host "${requireEnv('DB_HOST')}" refused connection — wrong host or port`;
  if (err.code === 'ENOTFOUND') return `[DEBUG ERROR] DB host "${requireEnv('DB_HOST')}" not found — check DB_HOST`;
  if (err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_DBACCESS_DENIED_ERROR') return `[DEBUG ERROR] DB user "${requireEnv('DB_USER')}" access denied — wrong DB_USER or DB_PASSWORD`;
  if (err.code === 'ER_BAD_DB_ERROR') return `[DEBUG ERROR] Database "${requireEnv('DB_NAME')}" does not exist — check DB_NAME`;
  if (err.code === 'ETIMEDOUT') return `[DEBUG ERROR] Connection to DB host "${requireEnv('DB_HOST')}" timed out`;
  if (err.code === 'PROTOCOL_CONNECTION_LOST') return '[DEBUG ERROR] DB connection lost during handshake';
  if (err.message?.includes('password')) return '[DEBUG ERROR] DB password missing or wrong';
  return `[DEBUG ERROR] DB connection failed — ${err.code || err.message || 'unknown error'}`;
};

export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('[OK] Database connected successfully');
    console.log('[DB] Database:', requireEnv('DB_NAME'));
    console.log('[Host] Host:', requireEnv('DB_HOST'));
    connection.release();
  } catch (error: any) {
    console.error(debugDbError(error));
    console.error('[DEBUG ERROR] Full error:', error.message || error);
    process.exit(1);
  }
};
