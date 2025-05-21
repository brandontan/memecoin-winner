const Token = require('../models/token');
const logger = require('../utils/logger');

class TokenRepository {
    /**
     * Save a new token
     */
    async saveToken(tokenData) {
        try {
            const token = new Token(tokenData);
            await token.save();
            logger.info(`Token saved: ${token.mintAddress}`);
            return token;
        } catch (error) {
            logger.error(`Error saving token: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update an existing token
     */
    async updateToken(mintAddress, updates) {
        try {
            const token = await Token.findOneAndUpdate(
                { mintAddress },
                { ...updates, lastUpdated: new Date() },
                { new: true }
            );
            
            if (!token) {
                throw new Error(`Token not found: ${mintAddress}`);
            }
            
            logger.info(`Token updated: ${mintAddress}`);
            return token;
        } catch (error) {
            logger.error(`Error updating token: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get a token by mint address
     */
    async getToken(mintAddress) {
        try {
            const token = await Token.findOne({ mintAddress });
            if (!token) {
                throw new Error(`Token not found: ${mintAddress}`);
            }
            return token;
        } catch (error) {
            logger.error(`Error getting token: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get tokens sorted by volume
     */
    async getTokensByScore(limit = 10) {
        try {
            return await Token.find()
                .sort({ currentVolume: -1 })
                .limit(limit);
        } catch (error) {
            logger.error(`Error getting tokens by score: ${error.message}`);
            throw error;
        }
    }

    /**
     * Add a volume data point to a token
     */
    async addVolumeDataPoint(mintAddress, volume, timestamp) {
        try {
            const token = await Token.findOne({ mintAddress });
            if (!token) {
                throw new Error(`Token not found: ${mintAddress}`);
            }

            token.volumeData.push({ volume, timestamp });
            token.currentVolume = volume;
            token.lastUpdated = new Date();
            
            await token.save();
            logger.info(`Volume data point added for token: ${mintAddress}`);
            return token;
        } catch (error) {
            logger.error(`Error adding volume data point: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new TokenRepository(); 