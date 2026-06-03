import express from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as userCtl from '../controllers/userController.js';
import * as pendingCtl from '../controllers/pendingController.js';
import * as bulkCtl from '../controllers/bulkImportController.js';
import {
  userIdParam, createUserSchema, updateUserSchema,
  updateCredentialsSchema, promoteUserSchema,
  idsReasonBody, reasonBody, bulkApproveBody, reviewActionBody
} from '../schemas/index.js';

const router = express.Router();

const upload = multer({
  dest: 'uploads/temp/',
  limits: { files: 1, fileSize: 10 * 1024 * 1024 }
});

router.use(authenticate);
router.use(authorize('ADMIN', 'SUPER_ADMIN'));

router.get('/users', userCtl.getAllUsers);
router.get('/users/sample-format', bulkCtl.downloadSampleExcel);
router.post('/users/bulk-import', upload.single('file'), bulkCtl.bulkImportUsers);
router.get('/users/:id', userCtl.getUserById);
router.post('/users', validate(createUserSchema), userCtl.createUser);
router.post('/users/:id/reassign-leaves', validate(userIdParam, 'params'), userCtl.reassignLeaves);
router.put('/users/:id', validate(userIdParam, 'params'), validate(updateUserSchema), userCtl.updateUser);
router.put('/users/:id/credentials', validate(userIdParam, 'params'), validate(updateCredentialsSchema), userCtl.updateCredentials);
router.delete('/users/:id', validate(userIdParam, 'params'), userCtl.deleteUser);
router.post('/users/:id/restore', validate(userIdParam, 'params'), userCtl.restoreUser);
router.post('/users/:id/promote', validate(userIdParam, 'params'), validate(promoteUserSchema), userCtl.promoteUser);
router.post('/users/:id/force-logout', validate(userIdParam, 'params'), userCtl.forceLogout);
router.post('/users/bulk-delete', validate(idsReasonBody), userCtl.bulkDelete);
router.delete('/users/:id/permanent', authorize('SUPER_ADMIN'), validate(userIdParam, 'params'), validate(reasonBody), userCtl.permanentDelete);
router.post('/users/bulk-permanent-delete', authorize('SUPER_ADMIN'), validate(idsReasonBody), userCtl.bulkPermanentDelete);

router.get('/pending/leave', pendingCtl.getPendingLeave);
router.get('/pending/product', pendingCtl.getPendingProducts);
router.put('/leave/:id/review', validate(userIdParam, 'params'), validate(reviewActionBody), pendingCtl.reviewLeave);
router.put('/product/:id/review', validate(userIdParam, 'params'), validate(reviewActionBody), pendingCtl.reviewProduct);

router.post('/users/:id/approve', validate(userIdParam, 'params'), userCtl.approveUser);
router.post('/users/:id/reject', validate(userIdParam, 'params'), validate(reasonBody), userCtl.rejectUser);
router.post('/users/bulk-approve', validate(bulkApproveBody), userCtl.bulkApprove);

export default router;
