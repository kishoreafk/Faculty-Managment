import cron from 'node-cron';
import { pool } from '../config/database.js';
import { isProduction } from '../config/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cronLog = (msg: string) => console.log(`[CRON] ${msg}`);

const scheduledTasks: cron.ScheduledTask[] = [];

export const initializeCronJobs = () => {
  // Monthly leave accrual - Runs on 1st of every month at 2:00 AM
  scheduledTasks.push(cron.schedule('0 2 1 * *', async () => {
    try {
      cronLog('Running monthly leave accrual...');
      await pool.execute('CALL sp_monthly_leave_accrual()');
      cronLog('Monthly leave accrual completed successfully');
    } catch (error: any) {
      console.error(`[DEBUG ERROR] [CRON] Monthly leave accrual failed: ${error?.message || error}`);
    }
  }));

  // Yearly leave accrual - Runs on January 1st at 3:00 AM
  scheduledTasks.push(cron.schedule('0 3 1 1 *', async () => {
    try {
      cronLog('Running yearly leave accrual...');
      await pool.execute('CALL sp_yearly_leave_accrual()');
      cronLog('Yearly leave accrual completed successfully');
    } catch (error: any) {
      console.error(`[DEBUG ERROR] [CRON] Yearly leave accrual failed: ${error?.message || error}`);
    }
  }));

  // Carry forward leaves - Runs on January 1st at 1:00 AM (before yearly accrual)
  scheduledTasks.push(cron.schedule('0 1 1 1 *', async () => {
    try {
      cronLog('Running leave carry forward...');
      await pool.execute('CALL sp_carry_forward_leaves()');
      cronLog('Leave carry forward completed successfully');
    } catch (error: any) {
      console.error(`[DEBUG ERROR] [CRON] Leave carry forward failed: ${error?.message || error}`);
    }
  }));

  // Temp file cleanup - Every day at 4:00 AM
  scheduledTasks.push(cron.schedule('0 4 * * *', async () => {
    try {
      const tempDir = path.join(__dirname, '..', '..', 'uploads', 'temp');
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        let removed = 0;
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.isFile() && now - stat.mtimeMs > dayMs) {
              fs.unlinkSync(filePath);
              removed++;
            }
          } catch { /* race condition: file deleted by another process */ }
        }
        if (removed > 0) cronLog(`Cleaned ${removed} old temp file(s)`);
      }
    } catch (error: any) {
      console.error(`[DEBUG ERROR] [CRON] Temp file cleanup failed: ${error?.message || error}`);
    }
  }));

  // Auth token cleanup - Every day at 4:30 AM
  scheduledTasks.push(cron.schedule('30 4 * * *', async () => {
    try {
      const [result]: any = await pool.execute('DELETE FROM auth_tokens WHERE expires_at < NOW()');
      if (result.affectedRows > 0) cronLog(`Cleaned ${result.affectedRows} expired auth token(s)`);
    } catch (error: any) {
      console.error(`[DEBUG ERROR] [CRON] Auth token cleanup failed: ${error?.message || error}`);
    }
  }));

  cronLog('Cron jobs initialized: Monthly accrual (1st, 2AM), Yearly accrual (Jan 1st, 3AM), Carry forward (Jan 1st, 1AM), Temp file cleanup (daily 4AM), Auth token cleanup (daily 4:30AM)');
};

export const stopCronJobs = () => {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;
  cronLog('Cron jobs stopped');
};
