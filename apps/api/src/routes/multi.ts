import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { uploadFiles } from '../lib/multipart';
import { handleCouncilRequest } from './council';

const router = Router();
router.post('/multi', authMiddleware, uploadFiles, handleCouncilRequest);
export default router;
