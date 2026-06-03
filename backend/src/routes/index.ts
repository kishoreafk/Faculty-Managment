import { Router } from 'express';
import masterCodesRouter from './masterCodes.js';
import departmentsRouter from './departments.js';
import auditLogsRouter from './auditLogs.js';
import workflowsRouter from './workflows.js';
import { register, login, refresh, getProfile, getFacultyTypes, logout } from '../controllers/authController.js';
import { getLeaveBalance, applyLeave, getLeaveApplications, updateLeaveStatus, getPendingLeaves, getLeaveHistory, getLeaveEligibility, triggerMonthlyAccrual, triggerYearlyAccrual, triggerCarryForward, getAlternateFaculty, confirmAdjustment, getMyAdjustments, getLeaveDetails, deleteLeaveApplication, updateFacultyLeaveBalance, getFacultyLeaveBalance } from '../controllers/leaveController.js';
import { getFormDefinition, submitForm, getSubmissions } from '../controllers/formController.js';
import { getPendingFaculty, approveFaculty, rejectFaculty, getAllFaculty } from '../controllers/adminController.js';
import { getDashboardSummary, getNotificationCount, getNotifications } from '../controllers/dashboardController.js';
import { createProductRequest, getMyProductRequests, getAllProductRequests, reviewProductRequest, deleteProductRequest, getProductRequestDetails } from '../controllers/productController.js';
import { createTimetableEntry, getMyTimetable, updateTimetableEntry, deleteTimetableEntry } from '../controllers/timetableController.js';
import { uploadFile, getMyFiles, downloadFile, previewFile, getCategories, adminGetAllFiles, deleteFile } from '../controllers/vaultifyController.js';
import { uploadTimetable, getMyTimetables, downloadTimetable, previewTimetable, adminGetAllTimetables, assignTimetable, unassignTimetable, getAssignedTimetable, deleteTimetableFile } from '../controllers/timetableFileController.js';
import { getAdminLogs, getLogById } from '../controllers/adminLogsController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ALLOWED_MIME_VALUES, makeUploader } from '../middleware/uploads.js';
import {
  applyLeaveSchema, reviewLeaveSchema, leaveStatusParam,
  adjustLeaveParam, confirmAdjustmentBody, updateFacultyLeaveBalanceBody,
  createProductRequestSchema, reviewProductSchema, productIdParam,
  createTimetableSchema, updateTimetableSchema, timetableIdParam,
  facultyIdParam, approveFacultyBody, rejectFacultyBody,
  submitFormSchema,
  assignTimetableSchema, unassignTimetableSchema,
  uploadFileBody, vaultFileIdParam
} from '../schemas/index.js';
import adminUserRoutes from './adminUserRoutes.js';

const maxUploadMbRaw = Number(process.env.MAX_UPLOAD_MB);
if (!process.env.MAX_UPLOAD_MB) console.warn('[DEBUG ERROR] MAX_UPLOAD_MB not set — defaulting to 25MB');
else if (isNaN(maxUploadMbRaw) || maxUploadMbRaw <= 0) console.warn(`[DEBUG ERROR] Invalid MAX_UPLOAD_MB "${process.env.MAX_UPLOAD_MB}" — defaulting to 25MB`);
const maxUploadMb = (maxUploadMbRaw > 0) ? maxUploadMbRaw : 25;

// Use the new hardened uploader that enforces:
//  - file size limit
//  - exactly 1 file per request
//  - whitelisted MIME types (no .exe, .php, .html, .svg, archives, etc.)
//  - filename rewritten to a UUID; original name is never used on disk
const upload = makeUploader({ maxMb: maxUploadMb, allowed: ALLOWED_MIME_VALUES });
// Bulk import only accepts Excel files.
const bulkImportUpload = makeUploader({ maxMb: 10, allowed: [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
] });

const router = Router();

// Auth routes
router.post('/auth/register', register);
router.post('/auth/login', login);
router.post('/auth/refresh', refresh);
router.post('/auth/logout', authenticate, logout);
router.get('/auth/profile', authenticate, getProfile);
router.get('/auth/faculty-types', getFacultyTypes);

// Dashboard
router.get('/dashboard/summary', authenticate, getDashboardSummary);
router.get('/dashboard/notifications', authenticate, getNotificationCount);
router.get('/dashboard/notifications/list', authenticate, getNotifications);

// Admin routes
router.get('/admin/pending-faculty', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getPendingFaculty);
router.put('/admin/faculty/:id/approve', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), validate(facultyIdParam, 'params'), validate(approveFacultyBody), approveFaculty);
router.put('/admin/faculty/:id/reject', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), validate(facultyIdParam, 'params'), validate(rejectFacultyBody), rejectFaculty);
router.get('/admin/faculty', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getAllFaculty);
router.get('/admin/logs', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getAdminLogs);
router.get('/admin/logs/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getLogById);

// Leave routes
router.get('/leave/balance', authenticate, getLeaveBalance);
router.get('/leave/eligibility', authenticate, getLeaveEligibility);
router.get('/leave/history', authenticate, getLeaveHistory);
router.get('/leave/pending', authenticate, authorize('ADMIN', 'HOD', 'SUPER_ADMIN'), getPendingLeaves);
router.get('/leave/alternate-faculty', authenticate, getAlternateFaculty);
router.get('/leave/adjustments/my', authenticate, getMyAdjustments);
router.post('/leave/apply', authenticate, validate(applyLeaveSchema), applyLeave);
router.get('/leave/applications', authenticate, getLeaveApplications);
router.get('/leave/:id', authenticate, validate(leaveStatusParam, 'params'), getLeaveDetails);
router.delete('/leave/:id', authenticate, validate(leaveStatusParam, 'params'), deleteLeaveApplication);
router.put('/leave/:id/status', authenticate, authorize('ADMIN', 'HOD', 'SUPER_ADMIN'), validate(leaveStatusParam, 'params'), validate(reviewLeaveSchema), updateLeaveStatus);
router.put('/leave/adjustments/:id/confirm', authenticate, validate(adjustLeaveParam, 'params'), validate(confirmAdjustmentBody), confirmAdjustment);

// Leave accrual admin routes
router.post('/admin/leave/accrual/monthly', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), triggerMonthlyAccrual);
router.post('/admin/leave/accrual/yearly', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), triggerYearlyAccrual);
router.post('/admin/leave/carry-forward', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), triggerCarryForward);
router.get('/admin/leave/balance/:facultyId', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getFacultyLeaveBalance);
router.put('/admin/leave/balance', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), validate(updateFacultyLeaveBalanceBody), updateFacultyLeaveBalance);

// Product requests
router.post('/product-requests', authenticate, validate(createProductRequestSchema), createProductRequest);
router.get('/product-requests/my', authenticate, getMyProductRequests);
router.get('/product-requests/:id', authenticate, validate(productIdParam, 'params'), getProductRequestDetails);
router.delete('/product-requests/:id', authenticate, validate(productIdParam, 'params'), deleteProductRequest);
router.get('/admin/product-requests', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getAllProductRequests);
router.put('/admin/product-requests/:id/review', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), validate(productIdParam, 'params'), validate(reviewProductSchema), reviewProductRequest);

// Timetable
router.post('/timetable', authenticate, validate(createTimetableSchema), createTimetableEntry);
router.get('/timetable/my', authenticate, getMyTimetable);
router.put('/timetable/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), validate(timetableIdParam, 'params'), validate(updateTimetableSchema), updateTimetableEntry);
router.delete('/timetable/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), validate(timetableIdParam, 'params'), deleteTimetableEntry);

// Form routes
router.get('/forms/:category', authenticate, getFormDefinition);
router.post('/forms/submit', authenticate, validate(submitFormSchema), submitForm);
router.get('/forms/submissions', authenticate, getSubmissions);

// Admin user management routes
router.use('/admin', adminUserRoutes);

// Vaultify routes
router.post('/vaultify/upload', authenticate, upload.single('file'), validate(uploadFileBody), uploadFile);
router.get('/vaultify/my', authenticate, getMyFiles);
router.get('/vaultify/files/:id/download', authenticate, validate(vaultFileIdParam, 'params'), downloadFile);
router.get('/vaultify/files/:id/preview', authenticate, validate(vaultFileIdParam, 'params'), previewFile);
router.delete('/vaultify/files/:id', authenticate, validate(vaultFileIdParam, 'params'), deleteFile);
router.get('/vaultify/categories', authenticate, getCategories);
router.get('/admin/vaultify/files', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminGetAllFiles);

// Timetable file routes
router.post('/timetables/upload', authenticate, upload.single('file'), uploadTimetable);
router.get('/timetables/my', authenticate, getMyTimetables);
router.get('/timetables/:id/download', authenticate, downloadTimetable);
router.get('/timetables/:id/preview', authenticate, previewTimetable);
router.delete('/timetables/:id', authenticate, validate(timetableIdParam, 'params'), deleteTimetableFile);
router.get('/timetables/assigned/me', authenticate, getAssignedTimetable);
router.get('/admin/timetables', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminGetAllTimetables);
router.post('/admin/timetables/assign', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), validate(assignTimetableSchema), assignTimetable);
router.post('/admin/timetables/unassign', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), validate(unassignTimetableSchema), unassignTimetable);

// =====================================================================
// Big-bang rewrite: new routes added alongside the existing ones.
// The legacy endpoints below keep their existing behavior; the new ones
// expose the same data through the unified audit / master-code /
// department / workflow surfaces.
// =====================================================================

// /api/master-codes
router.use('/master-codes', masterCodesRouter);

// /api/departments
router.use('/departments', departmentsRouter);

// /api/audit-logs
router.use('/audit-logs', auditLogsRouter);

// /api/workflows
router.use('/workflows', workflowsRouter);

export default router;
