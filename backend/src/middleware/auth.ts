import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { getJwtConfig, isProduction } from '../config/env.js';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  /** Token issuance time (seconds since epoch) */
  iat?: number;
  /** Token expiration time (seconds since epoch) */
  exp?: number;
  /** Token unique id (jti) for revocation tracking */
  jti?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  authz?: { requiredRoles: string[] };
}

/**
 * Extract bearer token from Authorization header or httpOnly cookie.
 * Cookies are preferred in production (httpOnly prevents XSS theft).
 */
const extractToken = (req: Request): string | null => {
  // 1) Bearer token (used by /api endpoints and by SPA that uses cookies)
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim() || null;
  }
  // 2) httpOnly cookie (preferred)
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  if (cookies && cookies.accessToken) {
    return cookies.accessToken;
  }
  return null;
};

/**
 * Authenticate middleware.
 *
 * CRITICAL: This middleware is server-authoritative.
 *  - It does NOT trust `role` from the JWT payload. The role is re-read from the
 *    database on every request, so role changes and account deactivations take
 *    effect immediately for the next request.
 *  - It checks a token revocation list (jti) so that logged-out / force-logged-out
 *    tokens are rejected even before they expire.
 */
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const jwtConfig = getJwtConfig();
    const decoded = jwt.verify(token, jwtConfig.secret, {
      algorithms: [jwtConfig.algorithm]
    }) as jwt.JwtPayload;

    // Reject if the token has been revoked (logout / force-logout / role change).
    if (decoded.jti) {
      const [revoked]: any = await pool.execute(
        'SELECT 1 FROM auth_token_revocations WHERE jti = ? LIMIT 1',
        [decoded.jti]
      );
      if (revoked.length > 0) {
        return res.status(401).json({ error: 'Token has been revoked' });
      }
    }

    // Re-read the user from the DB to ensure they are still active, approved,
    // not deleted, and to get the *current* role. This makes auth server-
    // authoritative: changing a role in the DB takes effect on the next
    // request, not on the next access-token refresh.
    const [users]: any = await pool.execute(
      `SELECT f.id, f.email, f.active, f.deleted, f.approved, r.name AS role
       FROM faculty f
       JOIN roles r ON r.id = f.role_id
       WHERE f.id = ?`,
      [decoded.id]
    );

    if (users.length === 0 || !users[0].active || users[0].deleted || !users[0].approved) {
      return res.status(401).json({ error: 'Account deactivated or removed' });
    }

    req.user = {
      id: users[0].id,
      email: users[0].email,
      role: users[0].role,
      iat: decoded.iat,
      exp: decoded.exp,
      jti: decoded.jti
    };
    next();
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (msg.includes('jwt malformed') || msg.includes('invalid token') || msg.includes('invalid signature')) {
      console.error('[DEBUG ERROR] JWT verification failed — invalid or tampered token. Check JWT_SECRET matches between backend builds.');
    } else if (msg.includes('jwt expired')) {
      console.error('[DEBUG ERROR] Token expired — client needs to refresh.');
    } else if (msg.includes('Unexpected token') || msg.includes('jwt must be provided')) {
      console.error('[DEBUG ERROR] JWT_SECRET environment variable may be missing or empty — check .env file.');
    } else {
      console.error('[DEBUG ERROR] Authentication error:', msg);
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    req.authz = { requiredRoles: roles };
    next();
  };
};

/**
 * Convenience middleware: require that the caller is a SUPER_ADMIN.
 * Use on any endpoint that mutates SUPER_ADMIN membership.
 */
export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};
