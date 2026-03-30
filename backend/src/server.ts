import './config/loadEnv.js';
import express from 'express';
import { testConnection, pool } from './config/database.js';
import { validateEnvOnBoot, requireEnv } from './config/env.js';
import routes from './routes/index.js';
import { initializeCronJobs } from './utils/cronJobs.js';
import { initializeStorage } from './utils/initStorage.js';
import { verifyTables } from './utils/verifyTables.js';
import { isProduction } from './config/env.js';

// Fail fast if critical env vars are missing.
validateEnvOnBoot();

const app = express();
const PORT = Number(requireEnv('PORT'));
app.use(express.json());

// Auto-audit disabled - controllers handle their own logging


app.use('/api', routes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const startServer = async () => {
  try {
    await testConnection();
    await verifyTables();
    initializeStorage();
    initializeCronJobs();
    const server = app.listen(PORT, () => {
      if (!isProduction) {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📍 API available at http://localhost:${PORT}/api`);
      }
    });

    process.on('SIGTERM', () => {
      server.close(() => {
        pool.end();
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      server.close(() => {
        pool.end();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
