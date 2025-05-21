const express = require('express');
const { body, param, validationResult } = require('express-validator');
const tokenRepository = require('../repositories/tokenRepository');
const logger = require('../utils/logger');

const router = express.Router();

// Validation middleware
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// Get tokens sorted by volume
router.get('/tokens',
    async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const tokens = await tokenRepository.getTokensByScore(limit);
            res.json(tokens);
        } catch (error) {
            logger.error(`Error getting tokens: ${error.message}`);
            res.status(500).json({ error: 'Failed to get tokens' });
        }
    }
);

// Get token by mint address
router.get('/tokens/:mintAddress',
    param('mintAddress').isString().notEmpty(),
    validateRequest,
    async (req, res) => {
        try {
            const token = await tokenRepository.getToken(req.params.mintAddress);
            res.json(token);
        } catch (error) {
            logger.error(`Error getting token: ${error.message}`);
            if (error.message.includes('not found')) {
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
    async (req, res) => {
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
            logger.error(`Error triggering refresh: ${error.message}`);
            res.status(500).json({ error: 'Failed to trigger refresh' });
        }
    }
);

module.exports = router; 