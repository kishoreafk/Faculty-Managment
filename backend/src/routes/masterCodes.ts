import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { MasterCodeService } from '../services/MasterCodeService.js';
import { createMasterCodeSchema } from '../schemas/index.js';

const router = Router();

/**
 * GET /api/master-codes
 * List all categories (lightweight summary).
 */
router.get('/', authenticate, asyncHandler(async (_req, res) => {
  const [rows]: any = await (await import('../config/database.js')).pool.execute(
    `SELECT category, COUNT(*) AS count
     FROM master_codes WHERE active = TRUE
     GROUP BY category ORDER BY category`
  );
  res.json(rows);
}));

/**
 * GET /api/master-codes/:category
 * List active codes for a category. Used to populate dropdowns.
 *
 * Examples: /api/master-codes/role, /api/master-codes/approval_status
 */
router.get('/:category', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const { category } = req.params;
  const includeInactive = req.query.includeInactive === 'true' && req.user?.role === 'SUPER_ADMIN';
  const rows = await MasterCodeService.listByCategory(category, includeInactive);
  if (rows.length === 0) {
    throw new AppError(404, 'CATEGORY_NOT_FOUND', `No codes found for category "${category}"`);
  }
  res.json(rows);
}));

/**
 * GET /api/master-codes/:category/:code
 * Fetch a single code. Useful for "is this code valid?" checks.
 */
router.get('/:category/:code', authenticate, asyncHandler(async (req, res) => {
  const { category, code } = req.params;
  const row = await MasterCodeService.get(category, code);
  if (!row) {
    throw new AppError(404, 'CODE_NOT_FOUND', `Code "${category}.${code}" not found`);
  }
  res.json(row);
}));

/**
 * POST /api/master-codes (SUPER_ADMIN only)
 * Create a new code in a category.
 */
router.post('/', authenticate, authorize('SUPER_ADMIN'), validate(createMasterCodeSchema), asyncHandler(async (req, res) => {
  const { category, code, name, displayOrder } = req.body;
  await MasterCodeService.assertActive(category, code).catch(() => null);
  const [existing]: any = await (await import('../config/database.js')).pool.execute(
    'SELECT id FROM master_codes WHERE category = ? AND code = ?',
    [category, code]
  );
  if (existing[0]) {
    throw new AppError(409, 'CODE_EXISTS', `Code "${category}.${code}" already exists`);
  }
  const [result]: any = await (await import('../config/database.js')).pool.execute(
    `INSERT INTO master_codes (category, code, name, display_order) VALUES (?, ?, ?, ?)`,
    [category, code, name ?? null, displayOrder ?? 0]
  );
  res.status(201).json({ id: result.insertId, category, code, name, displayOrder });
}));

export default router;
