import { Router } from 'express';
import apiController from '../controllers/apiController';

const router = Router();

// Health check route
router.get('/health', apiController.healthCheck);

// Get latest tokens
router.get('/tokens/latest', apiController.getLatestTokens);

// Get token by address
router.get('/tokens/:address', apiController.getTokenByAddress);

export default router;
