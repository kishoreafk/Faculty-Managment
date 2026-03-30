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
  queueLimit: 0
});

export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    console.log('📊 Database:', requireEnv('DB_NAME'));
    console.log('🏠 Host:', requireEnv('DB_HOST'));
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};
