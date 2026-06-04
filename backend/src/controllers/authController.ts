import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { getJwtConfig, isProduction } from '../config/env.js';
import { formatRowDates, formatRowDateTimes } from '../utils/timeFormat.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const BCRYPT_COST = 12;

// In-memory account lockout store.
// Tracks { count, firstAttempt } keyed by lowercase email.
// Entries older than LOCKOUT_WINDOW_MS are pruned on access.
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

function checkLockout(email: string): void {
  const key = email.toLowerCase();
  const record = loginAttempts.get(key);
  if (!record) return;

  // Prune if window expired.
  if (Date.now() - record.firstAttempt >= LOCKOUT_WINDOW_MS) {
    loginAttempts.delete(key);
    return;
  }

  if (record.count >= LOCKOUT_THRESHOLD) {
    const retryAfter = Math.ceil((LOCKOUT_WINDOW_MS - (Date.now() - record.firstAttempt)) / 1000);
    throw new AppError(429, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${retryAfter} seconds.`);
  }
}

function recordFailure(email: string): void {
  const key = email.toLowerCase();
  const record = loginAttempts.get(key);
  if (!record || Date.now() - record.firstAttempt >= LOCKOUT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: Date.now() });
  } else {
    record.count++;
  }
}

function clearLockout(email: string): void {
  loginAttempts.delete(email.toLowerCase());
}

/**
 * Cookie options for auth cookies.
 *
 *  - `httpOnly: true`  → not readable from JavaScript (XSS-theft resistant)
 *  - `secure: true`    → only sent over HTTPS (set in production)
 *  - `sameSite: 'lax'` → CSRF mitigation; tighten to 'strict' if you don't
 *                        need cross-site links to authenticated pages
 *  - `path: '/'`       → sent on all paths
 *  - `maxAge`          → access token expiry
 */
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  path: '/'
};

const refreshCookieOptions = {
  ...cookieOptions,
  // Refresh token has a longer life; browser keeps it for 7 days.
  maxAge: 7 * 24 * 60 * 60 * 1000
};

const accessCookieOptions = {
  ...cookieOptions,
  maxAge: 60 * 60 * 1000 // 1h, matches JWT_EXPIRES_IN default
};

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { employee_id, name, email, password, faculty_type_id, department, designation, doj } = req.body;

  if (!email || !password || !name || !employee_id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'employee_id, name, email, and password are required');
  }
  if (typeof password !== 'string' || password.length < 12) {
    throw new AppError(400, 'WEAK_PASSWORD', 'Password must be at least 12 characters');
  }

  const [existing]: any = await pool.execute('SELECT id FROM faculty WHERE LOWER(email) = LOWER(?)', [email]);
  if (existing.length > 0) {
    throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

  const [roleRow]: any = await pool.execute('SELECT id FROM roles WHERE name = ?', ['FACULTY']);
  const facultyRoleId = roleRow[0]?.id ?? 4;

  await pool.execute(
    `INSERT INTO faculty (employee_id, name, email, password_hash, role_id, faculty_type_id, department, designation, doj, approved)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
    [employee_id, name, email, hashedPassword, facultyRoleId, faculty_type_id, department, designation, doj]
  );

  res.status(201).json({ message: 'Registration submitted. Awaiting admin approval.' });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email and password are required');
  }

  // Check account lockout before proceeding.
  checkLockout(email);

  // We use a single, intentionally generic error message ("Invalid credentials")
  // for both "no such user" and "wrong password" to avoid user enumeration.
  const [rows]: any = await pool.execute(
    `SELECT f.id, f.email, f.password_hash, f.approved, f.active, f.deleted, f.force_password_reset, r.name AS role_name
     FROM faculty f
     JOIN roles r ON f.role_id = r.id
      WHERE LOWER(f.email) = LOWER(?)`,
    [email]
  );

  const invalidCreds = new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');

  if (rows.length === 0) {
    // Always run bcrypt to keep response time similar to a real user.
    await bcrypt.compare(password, '$2b$12$....................................................').catch(() => undefined);
    recordFailure(email);
    throw invalidCreds;
  }

  const user = rows[0];

  if (!user.active || user.deleted) {
    throw new AppError(403, 'ACCOUNT_DEACTIVATED', 'Account deactivated or removed');
  }
  if (!user.approved) {
    throw new AppError(403, 'ACCOUNT_PENDING', 'Account pending approval');
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    recordFailure(email);
    throw invalidCreds;
  }

  // Successful login — clear any lockout records.
  clearLockout(email);

  const jwtConfig = getJwtConfig();
  const accessJti = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();

  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role_name, jti: accessJti },
    jwtConfig.secret,
    {
      expiresIn: jwtConfig.expiresIn,
      algorithm: jwtConfig.algorithm
    } satisfies SignOptions
  );

  const refreshToken = jwt.sign(
    { id: user.id, jti: refreshJti },
    jwtConfig.refreshSecret,
    {
      expiresIn: jwtConfig.refreshExpiresIn,
      algorithm: jwtConfig.algorithm
    } satisfies SignOptions
  );

  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  await pool.execute(
    `INSERT INTO auth_tokens (faculty_id, refresh_token, token_hash, jti, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
    [user.id, refreshToken, refreshTokenHash, refreshJti]
  );

  await pool.execute(`UPDATE faculty SET last_login = NOW() WHERE id = ?`, [user.id]);

  // Set the access and refresh tokens as httpOnly cookies so that they
  // are not exposed to JavaScript (XSS-theft resistant). The legacy
  // Authorization header is still supported by the auth middleware.
  res.cookie('accessToken', accessToken, accessCookieOptions);
  res.cookie('refreshToken', refreshToken, refreshCookieOptions);

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.email, // legacy response shape: see getProfile for full data
      email: user.email,
      role: user.role_name,
      forcePasswordReset: !!user.force_password_reset
    }
  });
});

/**
 * Logout endpoint. Revokes the current access token's JTI so it cannot
 * be reused, even before its `exp`. Idempotent.
 */
export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  const jti = req.user?.jti;
  if (jti) {
    await pool.execute(
      'INSERT IGNORE INTO auth_token_revocations (jti, faculty_id, reason) VALUES (?, ?, ?)',
      [jti, req.user!.id, 'LOGOUT']
    );
  }
  // Clear cookies. Same options needed except maxAge=0.
  res.clearCookie('accessToken', { ...cookieOptions });
  res.clearCookie('refreshToken', { ...cookieOptions });
  res.json({ message: 'Logged out' });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) {
    throw new AppError(401, 'NO_REFRESH_TOKEN', 'Refresh token is required');
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const [rows]: any = await pool.execute(
    `SELECT t.faculty_id, t.jti, t.expires_at, t.revoked,
            f.active, f.approved, f.deleted, r.name AS role_name
     FROM auth_tokens t
     JOIN faculty f ON t.faculty_id = f.id
     JOIN roles r ON f.role_id = r.id
     WHERE t.token_hash = ?`,
    [tokenHash]
  );

  if (rows.length === 0) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token not found');
  }

  const record = rows[0];

  if (record.revoked || !record.active || record.deleted) {
    throw new AppError(401, 'TOKEN_REVOKED', 'Refresh token has been revoked');
  }

  if (!record.approved) {
    throw new AppError(403, 'ACCOUNT_PENDING', 'Account pending approval');
  }

  if (new Date(record.expires_at) < new Date()) {
    throw new AppError(401, 'TOKEN_EXPIRED', 'Refresh token has expired');
  }

  const [revoked]: any = await pool.execute(
    'SELECT 1 FROM auth_token_revocations WHERE jti = ? LIMIT 1',
    [record.jti]
  );
  if (revoked.length > 0) {
    throw new AppError(401, 'TOKEN_REVOKED', 'Refresh token has been revoked');
  }

  const jwtConfig = getJwtConfig();
  const accessJti = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();

  const accessToken = jwt.sign(
    { id: record.faculty_id, role: record.role_name, jti: accessJti },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresIn, algorithm: jwtConfig.algorithm } satisfies SignOptions
  );

  const refreshToken = jwt.sign(
    { id: record.faculty_id, jti: refreshJti },
    jwtConfig.refreshSecret,
    { expiresIn: jwtConfig.refreshExpiresIn, algorithm: jwtConfig.algorithm } satisfies SignOptions
  );

  const newRefreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  await pool.execute(
    `UPDATE auth_tokens SET revoked = TRUE, revoked_at = NOW() WHERE token_hash = ?`,
    [tokenHash]
  );

  await pool.execute(
    `INSERT INTO auth_tokens (faculty_id, refresh_token, token_hash, jti, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
    [record.faculty_id, refreshToken, newRefreshTokenHash, refreshJti]
  );

  res.cookie('accessToken', accessToken, accessCookieOptions);
  res.cookie('refreshToken', refreshToken, refreshCookieOptions);

  res.json({ accessToken, refreshToken });
});

export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.execute(
    `SELECT f.id, f.employee_id, f.name, f.email, f.department, f.designation, f.doj,
            f.gender, f.experience_years, f.qualification, f.approved, f.active,
            f.force_password_reset, f.last_login, f.created_at,
            r.name AS role_name,
            ft.name AS faculty_type
     FROM faculty f
     JOIN roles r ON f.role_id = r.id
     JOIN faculty_types ft ON f.faculty_type_id = ft.id
     WHERE f.id = ?`,
    [req.user!.id]
  );

  if (rows.length === 0) {
    throw new AppError(401, 'ACCOUNT_DEACTIVATED', 'Account deactivated or removed');
  }

  const user = rows[0];
  formatRowDates(user, ['doj']);
  formatRowDateTimes(user, ['created_at', 'last_login']);
  res.json(user);
});

export const getFacultyTypes = asyncHandler(async (req: Request, res: Response) => {
  const [rows] = await pool.execute(`SELECT * FROM faculty_types WHERE active = TRUE`);
  res.json(rows);
});
