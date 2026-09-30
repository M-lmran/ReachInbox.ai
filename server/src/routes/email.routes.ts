import { Router } from 'express';
import multer from 'multer';
import { emailController } from '../controllers/email.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { scheduleEmailSchema } from '../validators/email.validator';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from '../integrations/attachments/AttachmentStore';

const router = Router();

// Buffered in memory then written by the store, so a rejected file never
// reaches disk. Limits are enforced here and mirrored in the composer UI.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS },
});

router.use(requireAuth);

router.post('/schedule', validate(scheduleEmailSchema), emailController.schedule);
router.post(
  '/attachments',
  upload.array('files', MAX_ATTACHMENTS),
  emailController.uploadAttachments,
);
router.get('/scheduled', emailController.scheduled);
router.get('/sent', emailController.sent);
router.get('/stats', emailController.stats);
router.get('/search', emailController.search);
router.get('/:id', emailController.getOne);
router.post('/:id/retry', emailController.retry);

export default router;
