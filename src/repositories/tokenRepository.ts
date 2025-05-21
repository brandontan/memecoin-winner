import { Token, TokenDocument } from '../models/token';
import { logger } from '../utils/logger';
import { FilterQuery, UpdateQuery } from 'mongoose';

interface TokenData {
    mintAddress: string;
    name: string;
    symbol: string;
    createdAt: Date;
    creator: string;
    currentVolume: number;
    currentPrice: number;
    holderCount: number;
    liquidityAmount: number;
}

interface TokenUpdates {
    name?: string;
    symbol?: string;
    currentVolume?: number;
    currentPrice?: number;
    holderCount?: number;
    liquidityAmount?: number;
    potentialScore?: number;
    volumeGrowthRate?: number;
    isGraduated?: boolean;
    isActive?: boolean;
}

class TokenRepository {
    /**
     * Save a new token
     */
    async saveToken(tokenData: TokenData): Promise<TokenDocument> {
        try {
            const token = new Token(tokenData);
            await token.save();
            logger.info(`Token saved: ${token.mintAddress}`);
            return token;
        } catch (error) {
            logger.error(`Error saving token: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Update an existing token
     */
    async updateToken(mintAddress: string, updates: TokenUpdates): Promise<TokenDocument> {
        try {
            const filter: FilterQuery<TokenDocument> = { mintAddress };
            const update: UpdateQuery<TokenDocument> = { ...updates, lastUpdated: new Date() };
            const token = await Token.findOneAndUpdate(filter, update, { new: true }).exec();
            
            if (!token) {
                throw new Error(`Token not found: ${mintAddress}`);
            }
            
            logger.info(`Token updated: ${mintAddress}`);
            return token;
        } catch (error) {
            logger.error(`Error updating token: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Get a token by mint address
     */
    async getToken(mintAddress: string): Promise<TokenDocument> {
        try {
            const filter: FilterQuery<TokenDocument> = { mintAddress };
            const token = await Token.findOne(filter).exec();
            if (!token) {
                throw new Error(`Token not found: ${mintAddress}`);
            }
            return token;
        } catch (error) {
            logger.error(`Error getting token: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Get tokens sorted by volume
     */
    async getTokensByScore(limit: number = 10): Promise<TokenDocument[]> {
        try {
            return await Token.find()
                .sort({ currentVolume: -1 })
                .limit(limit)
                .exec();
        } catch (error) {
            logger.error(`Error getting tokens by score: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Add a volume data point to a token
     */
    async addVolumeDataPoint(mintAddress: string, volume: number, timestamp: Date): Promise<TokenDocument> {
        try {
            const filter: FilterQuery<TokenDocument> = { mintAddress };
            const token = await Token.findOne(filter).exec();
            if (!token) {
                throw new Error(`Token not found: ${mintAddress}`);
            }

            await token.updateTimeSeriesData('volume', volume);
            logger.info(`Volume data point added for token: ${mintAddress}`);
            return token;
        } catch (error) {
            logger.error(`Error adding volume data point: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
}

export const tokenRepository = new TokenRepository(); 