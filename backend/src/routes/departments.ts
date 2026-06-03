import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { DepartmentService } from '../services/DepartmentService.js';
import { AuditService } from '../services/AuditService.js';
import { createDepartmentSchema, departmentIdParam } from '../schemas/index.js';

const router = Router();

/**
 * GET /api/departments
 * List all active departments. Open to any authenticated user.
 */
router.get('/', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const includeInactive =
    String(req.query.includeInactive || '') === 'true' && req.user?.role === 'SUPER_ADMIN';
  const rows = await DepartmentService.list(1, includeInactive);
  res.json(rows);
}));

/**
 * GET /api/departments/:id
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'id must be an integer');
  }
  const d = await DepartmentService.getById(id);
  if (!d) throw new AppError(404, 'NOT_FOUND', 'Department not found');
  res.json(d);
}));

/**
 * POST /api/departments  (SUPER_ADMIN)
 */
router.post('/', authenticate, authorize('SUPER_ADMIN'), validate(createDepartmentSchema), asyncHandler(async (req: AuthRequest, res) => {
  const dept = await DepartmentService.create(req.body);
  await AuditService.logFromRequest(req, {
    action: 'department.created',
    entityType: 'department',
    entityId: dept.id,
    entityLabel: dept.name,
    afterState: { code: dept.code, name: dept.name }
  });
  res.status(201).json(dept);
}));

/**
 * DELETE /api/departments/:id  (SUPER_ADMIN) — soft delete
 */
router.delete('/:id', authenticate, authorize('SUPER_ADMIN'), validate(departmentIdParam, 'params'), asyncHandler(async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const dept = await DepartmentService.deactivate(id);
  await AuditService.logFromRequest(req, {
    action: 'department.deactivated',
    entityType: 'department',
    entityId: id,
    entityLabel: dept.name,
    afterState: { active: false }
  });
  res.json({ message: 'Department deactivated', department: dept });
}));

export default router;
