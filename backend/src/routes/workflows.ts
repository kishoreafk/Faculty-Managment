import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { WorkflowService } from '../services/WorkflowService.js';
import { startWorkflowSchema, actOnWorkflowSchema, workflowInstanceIdParam } from '../schemas/index.js';

const router = Router();

/**
 * POST /api/workflows/start
 * Start a new workflow instance for a given entity.
 */
router.post('/start', authenticate, validate(startWorkflowSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { workflowCode, entityType, entityId } = req.body;
  const result = await WorkflowService.start(req, {
    workflowCode: String(workflowCode),
    entityType: String(entityType),
    entityId: Number(entityId)
  });
  res.status(201).json(result);
}));

/**
 * POST /api/workflows/:instanceId/act
 * Act on the current step. body: { decision: 'APPROVE'|'REJECT'|'SKIP', comment?: string }
 */
router.post('/:instanceId/act', authenticate, validate(workflowInstanceIdParam, 'params'), validate(actOnWorkflowSchema), asyncHandler(async (req: AuthRequest, res) => {
  const instanceId = Number(req.params.instanceId);
  const { decision, comment } = req.body;
  const result = await WorkflowService.act(req, instanceId, decision, comment);
  res.json(result);
}));

/**
 * GET /api/workflows/pending
 * List pending workflow instances for the caller's role.
 */
router.get('/pending', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const role = req.user?.role;
  if (!role) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  const rows = await WorkflowService.listPendingForRole(role);
  res.json(rows);
}));

/**
 * GET /api/workflows/:instanceId
 * Get the full state of a workflow instance.
 */
router.get('/:instanceId', authenticate, asyncHandler(async (req, res) => {
  const instanceId = Number(req.params.instanceId);
  const inst = await WorkflowService.getInstance(instanceId);
  res.json(inst);
}));

export default router;
