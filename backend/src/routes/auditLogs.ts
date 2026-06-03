import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuditService } from '../services/AuditService.js';

const router = Router();

/**
 * GET /api/audit-logs
 * Paginated, filterable list of audit entries.
 * Restricted to ADMIN / SUPER_ADMIN (the existing /api/admin/logs
 * endpoint keeps its existing behavior; this is the new path).
 */
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthRequest, res) => {
  const result = await AuditService.list({
    actorId: req.query.actorId ? Number(req.query.actorId) : undefined,
    action: typeof req.query.action === 'string' ? req.query.action : undefined,
    entityType: typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
    entityId: req.query.entityId ? Number(req.query.entityId) : undefined,
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined
  });
  res.json(result);
}));

export default router;
