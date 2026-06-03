import { Response } from 'express';
import { pool } from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { productRequestRepository } from '../repositories/ProductRequestRepository.js';
import { AuditService } from '../services/AuditService.js';
import { formatRowDates, formatRowDateTimes } from '../utils/timeFormat.js';
import { sendProductReviewEmail } from '../utils/emailTemplates.js';

export const createProductRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { item_name, quantity, reason } = req.body;
  if (!item_name || !quantity || !reason) throw new AppError(400, 'VALIDATION_ERROR', 'item_name, quantity, and reason are required');

  const id = await productRequestRepository.create({
    faculty_id: req.user!.id,
    item_name,
    quantity,
    reason
  });

  await AuditService.logFromRequest(req, {
    action: 'PRODUCT_CREATED',
    entityType: 'product_request',
    entityId: id,
    entityLabel: item_name
  });

  res.status(201).json({ message: 'Product request created', id });
});

export const getMyProductRequests = asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = await productRequestRepository.findByFaculty(req.user!.id);
  rows.forEach((row: any) => {
    formatRowDates(row, ['created_at', 'reviewed_at', 'deleted_at']);
  });
  res.json(rows);
});

export const getAllProductRequests = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const rows = await productRequestRepository.findAllWithFaculty({ status: status as string | undefined });
  rows.forEach((row: any) => {
    formatRowDates(row, ['created_at']);
    formatRowDateTimes(row, ['reviewed_at']);
  });
  res.json(rows);
});

export const reviewProductRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { action, reason } = req.body;
  if (!reason || reason.trim() === '') throw new AppError(400, 'VALIDATION_ERROR', 'Reason is required');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [request]: any = await connection.execute(
      'SELECT pr.*, f.email as faculty_email, f.name as faculty_name FROM product_requests pr JOIN faculty f ON pr.faculty_id = f.id WHERE pr.id = ? FOR UPDATE',
      [id]
    );
    if (!request[0] || request[0].status !== 'PENDING') {
      throw new AppError(400, 'INVALID_STATE', 'Invalid request or already processed');
    }
    await connection.execute(
      'UPDATE product_requests SET status = ?, admin_id = ?, admin_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [action, req.user!.id, reason, id]
    );
    await connection.commit();

    await AuditService.logFromRequest(req, {
      action: action === 'APPROVED' ? 'PRODUCT_APPROVE' : 'PRODUCT_REJECT',
      entityType: 'product_request',
      entityId: Number(id),
      beforeState: { status: 'PENDING' },
      afterState: { status: action },
      reason
    });

    res.json({ message: `Product request ${action.toLowerCase()}` });
    if (request[0].faculty_email) {
      sendProductReviewEmail({
        email: request[0].faculty_email,
        name: request[0].faculty_name,
        itemName: request[0].item_name,
        quantity: request[0].quantity,
        reason: request[0].reason,
        status: action,
        reviewerNote: reason
      }).catch(() => {});
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const deleteProductRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const request = await productRequestRepository.findById(Number(id));
  if (!request) throw new AppError(404, 'NOT_FOUND', 'Product request not found');
  if (request.faculty_id !== req.user!.id) throw new AppError(403, 'FORBIDDEN', 'Unauthorized');
  if (request.status !== 'PENDING') throw new AppError(400, 'INVALID_STATE', 'Only pending requests can be deleted');

  await pool.execute("UPDATE product_requests SET status = 'DELETED', deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  res.json({ message: 'Product request deleted successfully' });
});

export const getProductRequestDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const request = await productRequestRepository.getDetails(Number(id));
  if (!request) throw new AppError(404, 'NOT_FOUND', 'Product request not found');
  formatRowDates(request, ['created_at']);
  formatRowDateTimes(request, ['reviewed_at']);
  res.json(request);
});
