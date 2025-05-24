import express, { Router, Request, Response, NextFunction } from 'express';
import { query, param, body } from 'express-validator';
import { tokenController } from '../controllers/tokenController';

// Define request handler type for better type safety
type RequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
import { validateRequest } from '../middleware/validateRequest';

const router: Router = express.Router();

// Get token by address
router.get('/tokens/:address', [
  param('address').isString().trim().isLength({ min: 32, max: 44 })
], validateRequest,  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      await tokenController.getToken(req, res);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler);

// List tokens with filtering and pagination
router.get('/tokens', [
  query('status').optional().isIn(['new', 'watch', 'strong', 'graduated']),
  query('minScore').optional().isFloat({ min: 0, max: 100 }),
  query('maxScore').optional().isFloat({ min: 0, max: 100 }),
  query('sortBy').optional().isIn(['score', 'createdAt', 'metrics.volume24h']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], validateRequest,  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      await tokenController.listTokens(req, res);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler);

// Get high potential tokens
router.get('/tokens/high-potential', [
  query('limit').optional().isInt({ min: 1, max: 100 })
], validateRequest,  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      await tokenController.getHighPotential(req, res);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler);

// Get trending tokens
router.get('/tokens/trending', [
  query('limit').optional().isInt({ min: 1, max: 100 })
], validateRequest,  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      await tokenController.getTrending(req, res);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler);

// Search tokens
router.get('/tokens/search', [
  query('query').isString().trim().notEmpty(),
  query('limit').optional().isInt({ min: 1, max: 100 })
], validateRequest,  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      await tokenController.searchTokens(req, res);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler);

// Get tokens near graduation
router.get('/tokens/near-graduation', [
  query('limit').optional().isInt({ min: 1, max: 100 })
], validateRequest, (async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tokenController.getNearGraduation(req, res);
  } catch (error) {
    next(error);
  }
}) as RequestHandler);

// Get tokens by creator
router.get('/creators/:creator/tokens', [
  param('creator').isString().trim().isLength({ min: 32, max: 44 })
], validateRequest, (async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tokenController.getByCreator(req, res);
  } catch (error) {
    next(error);
  }
}) as RequestHandler);

// Error handling middleware
router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Route error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default router; 