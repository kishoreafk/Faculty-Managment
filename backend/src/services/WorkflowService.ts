import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { AuditService } from './AuditService.js';

/**
 * Workflow engine skeleton.
 *
 * The current production paths still mutate the per-entity status
 * columns on `leave_applications`, `product_requests`, and
 * `form_submissions` directly. This service exposes the new
 * workflow-aware API surface in parallel so callers can adopt it
 * without breaking the existing endpoints.
 *
 * Concepts:
 *   - workflow_definitions  — template (e.g. 'LEAVE', 'PRODUCT_REQUEST')
 *   - workflow_steps        — ordered assignees
 *   - workflow_instances    — one per entity, lifecycle
 *   - workflow_step_assignments — one per (instance, step, assignee)
 *
 * Statuses (workflow_instances.status):
 *   PENDING → IN_PROGRESS → APPROVED | REJECTED | CANCELLED
 */
export type WorkflowStatus = 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type StepAssignmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';

export class WorkflowService {
  /**
   * Start a new workflow instance for a given entity. The first step's
   * assignee records are created and the instance status is set to
   * PENDING. The caller is responsible for keeping the entity's own
   * status column in sync (e.g. leave_applications.status).
   */
  static async start(req: AuthRequest, params: {
    workflowCode: string;
    entityType: string;
    entityId: number;
    organizationId?: number;
  }): Promise<{ instanceId: number }> {
    const [wfRows]: any = await pool.execute(
      `SELECT id FROM workflow_definitions WHERE code = ? AND active = TRUE LIMIT 1`,
      [params.workflowCode]
    );
    if (!wfRows[0]) {
      throw new AppError(404, 'WORKFLOW_NOT_FOUND', `No active workflow "${params.workflowCode}"`);
    }
    const workflowId = wfRows[0].id;

    const [stepRows]: any = await pool.execute(
      `SELECT id, step_order, assignee_type, assignee_value
       FROM workflow_steps
       WHERE workflow_id = ?
       ORDER BY step_order`,
      [workflowId]
    );
    if (stepRows.length === 0) {
      throw new AppError(500, 'WORKFLOW_MISCONFIGURED', 'Workflow has no steps');
    }
    const firstStepId = stepRows[0].id;

    const [result]: any = await pool.execute(
      `INSERT INTO workflow_instances
         (organization_id, workflow_id, entity_type, entity_id, current_step_id, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [params.organizationId ?? 1, workflowId, params.entityType, params.entityId, firstStepId, req.user?.id ?? 0]
    );
    const instanceId = Number(result.insertId);

    // Create step assignments for step 1.
    await WorkflowService.createAssignmentsForStep(
      instanceId, firstStepId, stepRows[0].assignee_type, stepRows[0].assignee_value
    );

    await AuditService.logFromRequest(req, {
      action: 'workflow.started',
      entityType: params.entityType,
      entityId: params.entityId,
      entityLabel: `${params.workflowCode}#${params.entityId}`,
      afterState: { instanceId, status: 'PENDING', firstStepId }
    });

    return { instanceId };
  }

  /**
   * Advance a workflow by acting on the current step.
   * The caller passes an explicit decision: 'APPROVE' moves to the next
   * step (or completes the workflow if it was the last one), 'REJECT'
   * terminates with REJECTED, 'SKIP' marks the step as skipped.
   */
  static async act(req: AuthRequest, instanceId: number, decision: 'APPROVE' | 'REJECT' | 'SKIP', comment?: string): Promise<{ status: WorkflowStatus; currentStepId: number | null }> {
    const [instRows]: any = await pool.execute(
      `SELECT id, workflow_id, current_step_id, status, entity_type, entity_id
       FROM workflow_instances WHERE id = ? LIMIT 1`,
      [instanceId]
    );
    if (!instRows[0]) throw new AppError(404, 'NOT_FOUND', 'Workflow instance not found');
    const inst = instRows[0];
    if (inst.status === 'APPROVED' || inst.status === 'REJECTED' || inst.status === 'CANCELLED') {
      throw new AppError(409, 'WORKFLOW_DONE', `Workflow is already ${inst.status}`);
    }
    if (!inst.current_step_id) {
      throw new AppError(500, 'WORKFLOW_INVALID', 'Workflow has no current step');
    }

    // Record the assignment.
    await pool.execute(
      `UPDATE workflow_step_assignments
       SET status = ?, comment = ?, acted_at = NOW()
       WHERE instance_id = ? AND step_id = ? AND assignee_id = ?`,
      [decision === 'APPROVE' ? 'APPROVED' : decision === 'REJECT' ? 'REJECTED' : 'SKIPPED',
       comment ?? null, instanceId, inst.current_step_id, req.user?.id]
    );

    if (decision === 'REJECT') {
      await pool.execute(
        `UPDATE workflow_instances SET status = 'REJECTED', completed_at = NOW(), current_step_id = NULL WHERE id = ?`,
        [instanceId]
      );
      await AuditService.logFromRequest(req, {
        action: 'workflow.rejected',
        entityType: inst.entity_type,
        entityId: Number(inst.entity_id),
        entityLabel: `instance#${instanceId}`,
        afterState: { status: 'REJECTED' }
      });
      return { status: 'REJECTED', currentStepId: null };
    }

    // Find the next step.
    const [nextRows]: any = await pool.execute(
      `SELECT id, step_order, assignee_type, assignee_value
       FROM workflow_steps
       WHERE workflow_id = ? AND step_order > (SELECT step_order FROM workflow_steps WHERE id = ?)
       ORDER BY step_order LIMIT 1`,
      [inst.workflow_id, inst.current_step_id]
    );
    if (!nextRows[0]) {
      // No more steps → workflow is approved.
      await pool.execute(
        `UPDATE workflow_instances SET status = 'APPROVED', completed_at = NOW(), current_step_id = NULL WHERE id = ?`,
        [instanceId]
      );
      await AuditService.logFromRequest(req, {
        action: 'workflow.approved',
        entityType: inst.entity_type,
        entityId: Number(inst.entity_id),
        entityLabel: `instance#${instanceId}`,
        afterState: { status: 'APPROVED' }
      });
      return { status: 'APPROVED', currentStepId: null };
    }
    // Move to the next step.
    const nextStepId = nextRows[0].id;
    await pool.execute(
      `UPDATE workflow_instances SET current_step_id = ?, status = 'IN_PROGRESS' WHERE id = ?`,
      [nextStepId, instanceId]
    );
    await WorkflowService.createAssignmentsForStep(
      instanceId, nextStepId, nextRows[0].assignee_type, nextRows[0].assignee_value
    );
    await AuditService.logFromRequest(req, {
      action: 'workflow.step_advanced',
      entityType: inst.entity_type,
      entityId: Number(inst.entity_id),
      entityLabel: `instance#${instanceId}`,
      afterState: { newStepId: nextStepId, status: 'IN_PROGRESS' }
    });
    return { status: 'IN_PROGRESS', currentStepId: nextStepId };
  }

  /**
   * List workflow instances for a given role (e.g. all PENDING instances
   * whose current step is assigned to 'ADMIN').
   */
  static async listPendingForRole(roleCode: string): Promise<any[]> {
    const [rows] = await pool.execute<any[]>(
      `SELECT i.id, i.workflow_id, i.entity_type, i.entity_id, i.current_step_id,
              i.status, i.created_at, d.code AS workflow_code
       FROM workflow_instances i
       JOIN workflow_definitions d ON d.id = i.workflow_id
       JOIN workflow_steps s ON s.id = i.current_step_id
       LEFT JOIN workflow_step_assignments a
         ON a.instance_id = i.id AND a.step_id = i.current_step_id
       WHERE s.assignee_type = 'ROLE' AND s.assignee_value = ?
         AND i.status IN ('PENDING', 'IN_PROGRESS')
         AND (a.id IS NULL OR a.status = 'PENDING')
       ORDER BY i.created_at ASC`,
      [roleCode]
    );
    return rows;
  }

  /**
   * Get the current state of a workflow instance with its steps and
   * assignments.
   */
  static async getInstance(instanceId: number): Promise<any> {
    const [instRows]: any = await pool.execute(
      `SELECT * FROM workflow_instances WHERE id = ? LIMIT 1`,
      [instanceId]
    );
    if (!instRows[0]) throw new AppError(404, 'NOT_FOUND', 'Workflow instance not found');
    const [steps]: any = await pool.execute(
      `SELECT s.id, s.step_order, s.step_name, s.assignee_type, s.assignee_value,
              a.assignee_id, a.status AS assignment_status, a.comment, a.acted_at
       FROM workflow_steps s
       LEFT JOIN workflow_step_assignments a
         ON a.instance_id = ? AND a.step_id = s.id
       WHERE s.workflow_id = ?
       ORDER BY s.step_order`,
      [instanceId, instRows[0].workflow_id]
    );
    return { ...instRows[0], steps };
  }

  // ---- helpers ----

  /**
   * Materialize one or more `workflow_step_assignments` rows for a step.
   * For ROLE-assigned steps, the actual assignee list is computed from
   * the current faculty table (e.g. all HODs). For USER/DEPARTMENT_HEAD
   * it's resolved at act() time. For now we just create a single
   * placeholder assignment keyed by the actor at act() time.
   */
  private static async createAssignmentsForStep(
    instanceId: number,
    stepId: number,
    assigneeType: string,
    assigneeValue: string | null
  ): Promise<void> {
    if (assigneeType === 'ROLE' && assigneeValue) {
      // Find all active users with the given role.
      const [users]: any = await pool.execute(
        `SELECT f.id FROM faculty f JOIN roles r ON r.id = f.role_id
         WHERE r.name = ? AND f.active = TRUE AND f.deleted = FALSE AND f.approved = TRUE`,
        [assigneeValue]
      );
      if (users.length === 0) {
        // Nobody holds the role — log a warning but don't fail. Operators
        // can fix the role assignment out-of-band.
        // eslint-disable-next-line no-console
        console.warn(`[WorkflowService] No users hold role "${assigneeValue}" for step ${stepId}`);
        return;
      }
      for (const u of users) {
        await pool.execute(
          `INSERT IGNORE INTO workflow_step_assignments (instance_id, step_id, assignee_id, status)
           VALUES (?, ?, ?, 'PENDING')`,
          [instanceId, stepId, u.id]
        );
      }
    } else {
      // USER / DEPARTMENT_HEAD / REPORTING_MANAGER — left for the
      // future when we have a richer identity model. Log a warning.
      // eslint-disable-next-line no-console
      console.warn(`[WorkflowService] Unhandled assignee type "${assigneeType}" for step ${stepId}`);
    }
  }
}
