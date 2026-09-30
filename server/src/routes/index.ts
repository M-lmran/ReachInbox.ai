import { Router } from 'express';
import { healthController } from '../controllers/health.controller';
import authRoutes from './auth.routes';
import emailRoutes from './email.routes';

const router = Router();

router.get('/health', healthController.health);
router.get('/health/queue', healthController.queue);
router.get('/health/queue/stream', healthController.queueStream);
router.use('/auth', authRoutes);
router.use('/emails', emailRoutes);

export default router;
