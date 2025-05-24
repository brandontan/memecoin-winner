import Token from '../models/token';
import { Document } from 'mongoose';

type TokenDocument = InstanceType<typeof Token>;
import logger from '../utils/logger';
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
    }
  }

  async updateToken(mintAddress: string, updates: Partial<TokenData>): Promise<any> {
    try {
      const token = await Token.findOneAndUpdate(
        { mintAddress },
        { $set: { ...updates, lastUpdated: new Date() } },
        { new: true }
      );
      
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

  async findByMint(mintAddress: string): Promise<any> {
    try {
      return await Token.findOne({ mintAddress });
    } catch (error) {
      logger.error(`Error finding token by mint: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async findActiveTokens(): Promise<any[]> {
    try {
      return await Token.find({ isActive: true });
    } catch (error) {
      logger.error(`Error finding active tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async findHighPotential(limit = 10): Promise<any[]> {
    try {
      return await Token.find({
        isActive: true,
        isGraduated: false,
        potentialScore: { $gte: 70 }
      })
      .sort({ potentialScore: -1 })
      .limit(limit);
    } catch (error) {
      logger.error(`Error finding high potential tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async findTrending(limit = 10): Promise<any[]> {
    try {
      return await Token.find({
        isActive: true,
        volumeGrowthRate: { $gt: 0 }
      })
      .sort({ volumeGrowthRate: -1 })
      .limit(limit);
    } catch (error) {
      logger.error(`Error finding trending tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async findByCreator(creatorAddress: string): Promise<any[]> {
    try {
      return await Token.find({ creator: creatorAddress });
    } catch (error) {
      logger.error(`Error finding tokens by creator: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async search(query: string, limit = 10): Promise<any[]> {
    try {
      const searchRegex = new RegExp(query, 'i');
      return await Token.find({
        $or: [
          { name: searchRegex },
          { symbol: searchRegex },
          { mintAddress: searchRegex },
          { creator: query }
        ]
      }).limit(limit);
    } catch (error) {
      logger.error(`Error searching tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async updatePatterns(mintAddress: string, patterns: string[]): Promise<void> {
    try {
      await Token.updateOne(
        { mintAddress },
        { $addToSet: { detectedPatterns: { $each: patterns } } }
      );
      logger.info(`Updated patterns for token: ${mintAddress}`);
    } catch (error) {
      logger.error(`Error updating patterns: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async markAsGraduated(mintAddress: string): Promise<void> {
    try {
      await Token.updateOne(
        { mintAddress },
        { 
          $set: { 
            isGraduated: true,
            graduatedAt: new Date() 
          } 
        }
      );
      logger.info(`Token graduated: ${mintAddress}`);
    } catch (error) {
      logger.error(`Error marking token as graduated: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async findNearGraduation(limit = 10): Promise<any[]> {
    try {
      return await Token.find({
        isActive: true,
        isGraduated: false,
        isNearGraduation: true
      })
      .sort({ potentialScore: -1 })
      .limit(limit);
    } catch (error) {
      logger.error(`Error finding tokens near graduation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
}

export const tokenRepository = new TokenRepository();