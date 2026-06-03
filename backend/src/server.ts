import './config/loadEnv.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { testConnection, pool } from './config/database.js';
import { validateEnvOnBoot, requireEnv, isProduction } from './config/env.js';
import routes from './routes/index.js';
import { initializeCronJobs, stopCronJobs } from './utils/cronJobs.js';
import { initializeStorage } from './utils/initStorage.js';
import { verifyTables } from './utils/verifyTables.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Fail fast if critical env vars are missing.
validateEnvOnBoot();

const app = express();
const PORT = Number(requireEnv('PORT'));

// ---------------------------------------------------------------------------
// Trust proxy: when running behind nginx (the only supported deployment),
// trust the first proxy hop so req.ip and rate limiting work correctly.
// ---------------------------------------------------------------------------
if (process.env.TRUST_PROXY === '1' || isProduction) {
  app.set('trust proxy', 1);
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
app.use(
  helmet({
    // The frontend is served from the same origin (via nginx) so we can use
    // a relatively strict default CSP. Adjust if you serve assets from a CDN.
    contentSecurityPolicy: isProduction
      ? {
          useDefaults: true,
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            'style-src': ["'self'", "'unsafe-inline'"], // Tailwind emits inline styles
            'img-src': ["'self'", 'data:', 'blob:'],
            'connect-src': ["'self'"],
            'object-src': ["'none'"],
            'frame-ancestors': ["'none'"]
          }
        }
      : false,
    // We send HSTS at the nginx level too; double-stacking is fine.
    strictTransportSecurity: {
      maxAge: 60 * 60 * 24 * 365,
      includeSubDomains: true,
      preload: false
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false
  })
);

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
// In production, frontend and backend are served from the same origin (via
// nginx), so CORS is mostly a no-op. If you split them onto different
// origins, set `CORS_ORIGIN` to a comma-separated allowlist.
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header (server-to-server, curl, etc.) → allow.
      if (!origin) return callback(null, true);
      // If no allowlist is configured, allow the request (default for same-origin).
      if (corsOrigins.length === 0) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400
  })
);

// ---------------------------------------------------------------------------
// Body parsing with a small, bounded limit. Default 1mb is plenty for JSON.
// 5mb allows room for the optional `attachments` array on leave applications
// while still preventing DoS via giant payloads.
// ---------------------------------------------------------------------------
app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || '5mb'
  })
);
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Parse cookies (for httpOnly auth cookies in production)
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
// General API limiter: 300 requests per minute per IP.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.', code: 'RATE_LIMITED' }
});

// Stricter limiter for auth endpoints (login/register): 10 per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts, please try again later.', code: 'RATE_LIMITED' }
});

// Apply the general limiter to /api, and a stricter one to /api/auth/*.
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api', routes);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', async (_req, res) => {
  // 200 only if the DB is reachable. This is what docker-compose's
  // healthcheck polls, so a 200 here is a strong signal that the system
  // is actually usable.
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'DEGRADED', reason: 'database_unreachable' });
  }
});

// ---------------------------------------------------------------------------
// 404 and central error handler
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const startServer = async () => {
  try {
    await testConnection();
    await verifyTables();
    initializeStorage();
    initializeCronJobs();
    const server = app.listen(PORT, () => {
      if (!isProduction) {
        // eslint-disable-next-line no-console
        console.log(`Server running on http://localhost:${PORT}`);
      }
    });

    // Graceful shutdown — close in-flight requests, then the DB pool.
    let shuttingDown = false;
    const shutdown = (signal: string) => () => {
      if (shuttingDown) return;
      shuttingDown = true;
      if (!isProduction) console.log(`Received ${signal}, shutting down...`);
      // Stop cron jobs from firing new tasks
      stopCronJobs();
      // Stop accepting new connections.
      server.close(() => {
        pool.end().finally(() => process.exit(0));
      });
      // Force-exit if shutdown takes longer than 15s.
      setTimeout(() => process.exit(1), 15000).unref();
    };
    process.on('SIGTERM', shutdown('SIGTERM'));
    process.on('SIGINT', shutdown('SIGINT'));
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (msg.includes('Missing required environment variable')) {
      console.error('[DEBUG ERROR] Server startup failed —', msg);
    } else if (msg.includes('listen EADDRINUSE')) {
      console.error(`[DEBUG ERROR] Port ${PORT} is already in use — another process may be running.`);
    } else if (msg.includes('ECONNREFUSED') || msg.includes('ER_ACCESS_DENIED_ERROR')) {
      console.error('[DEBUG ERROR] Server startup failed —', msg);
    } else {
      console.error('[DEBUG ERROR] Server startup failed —', msg);
    }
    process.exit(1);
  }
};

startServer();
