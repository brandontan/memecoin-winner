import express, { Request, Response, NextFunction, Router } from 'express';
import { body, param, validationResult, ValidationChain } from 'express-validator';
import { tokenRepository } from '../repositories/tokenRepository';
import { logger } from '../utils/logger';
import { TokenDocument } from '../types/token.types';

const router: Router = express.Router();

// Validation middleware
const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    next();
};

// Get tokens sorted by volume
router.get('/tokens',
    async (req: Request, res: Response) => {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const tokens = await tokenRepository.getTokensByScore(limit);
            res.json(tokens);
        } catch (error) {
            logger.error(`Error getting tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
            res.status(500).json({ error: 'Failed to get tokens' });
        }
    }
);

// Get token by mint address
router.get('/tokens/:mintAddress',
    param('mintAddress').isString().notEmpty(),
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const token = await tokenRepository.getToken(req.params.mintAddress);
            res.json(token);
        } catch (error) {
            logger.error(`Error getting token: ${error instanceof Error ? error.message : 'Unknown error'}`);
            if (error instanceof Error && error.message.includes('not found')) {
                res.status(404).json({ error: 'Token not found' });
            } else {
                res.status(500).json({ error: 'Failed to get token' });
            }
        }
    }
);

// Trigger manual refresh
router.post('/tokens/refresh',
    body('mintAddress').optional().isString().notEmpty(),
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const { mintAddress } = req.body;
            
            if (mintAddress) {
                // Refresh specific token
                const token = await tokenRepository.getToken(mintAddress);
                // TODO: Trigger token refresh in monitoring service
                res.json({ message: `Refresh triggered for token: ${mintAddress}` });
            } else {
                // Refresh all tokens
                // TODO: Trigger refresh for all tokens in monitoring service
                res.json({ message: 'Refresh triggered for all tokens' });
            }
        } catch (error) {
            logger.error(`Error triggering refresh: ${error instanceof Error ? error.message : 'Unknown error'}`);
            res.status(500).json({ error: 'Failed to trigger refresh' });
        }
    }
);

export default router; 