import Token from '../models/token';
import { FilterQuery, UpdateQuery } from 'mongoose';
import { Connection } from '@solana/web3.js';
import logger from '../utils/logger';
import { calculateMarketCap, updateTokenWithMarketCap } from '../utils/marketCap';

type ITokenDocument = InstanceType<typeof Token>;
type ITokenModel = typeof Token;

interface ITokenRepository {
  createToken(tokenData: Partial<ITokenDocument>): Promise<ITokenDocument>;
  updateToken(mintAddress: string, updates: Partial<ITokenDocument>): Promise<ITokenDocument | null>;
  findByMint(mintAddress: string): Promise<ITokenDocument | null>;
  findActiveTokens(limit: number): Promise<ITokenDocument[]>;
  findTokensByCreator(creatorAddress: string, limit: number): Promise<ITokenDocument[]>;
  findTopPerformingTokens(limit: number): Promise<ITokenDocument[]>;
  findNewestTokens(limit: number): Promise<ITokenDocument[]>;
  findTokensWithHighVolume(limit: number): Promise<ITokenDocument[]>;
  findTokensWithHighHolderCount(limit: number): Promise<ITokenDocument[]>;
  findTokensWithHighLiquidity(limit: number): Promise<ITokenDocument[]>;
  findTokensByPattern(pattern: string, limit: number): Promise<ITokenDocument[]>;
  deleteToken(mintAddress: string): Promise<boolean>;
  findHighPotential(limit: number, minScore?: number): Promise<ITokenDocument[]>;
  findNearGraduation(limit: number): Promise<ITokenDocument[]>;
  findGraduated(limit: number): Promise<ITokenDocument[]>;
  search(query: string, limit: number): Promise<ITokenDocument[]>;
  updatePatterns(mintAddress: string, patterns: string[]): Promise<void>;
  markAsGraduated(mintAddress: string): Promise<void>;
}

class TokenRepository implements ITokenRepository {
  private model: ITokenModel;

  constructor() {
    this.model = Token as unknown as ITokenModel;
  }

  async createToken(tokenData: Partial<ITokenDocument>, solanaConnection?: Connection): Promise<ITokenDocument> {
    try {
      let token = new this.model(tokenData);
      
      // If we have a Solana connection and token price, calculate market cap
      if (solanaConnection && tokenData.currentPrice) {
        try {
          const marketCapData = await calculateMarketCap(
            solanaConnection,
            token.mintAddress,
            token.currentPrice
          );
          token = updateTokenWithMarketCap(token, marketCapData);
        } catch (error) {
          logger.error(`Error calculating market cap for ${token.mintAddress}:`, error);
          // Continue without market cap data if there's an error
        }
      }
      
      const savedToken = await token.save();
      logger.info(`Token created: ${savedToken.mintAddress}`);
      return savedToken;
    } catch (error) {
      logger.error(`Error creating token: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async updateToken(mintAddress: string, updates: Partial<ITokenDocument>): Promise<ITokenDocument | null> {
    try {
      const token = await this.model.findOneAndUpdate(
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

  async findByMint(mintAddress: string): Promise<ITokenDocument | null> {
    try {
      return await this.model.findOne({ mintAddress });
    } catch (error) {
      logger.error(`Error finding token by mint: ${mintAddress}`, error);
      throw error;
    }
  }

  async findActiveTokens(limit: number = 10): Promise<ITokenDocument[]> {
    try {
      return await this.model
        .find({ isActive: true })
        .sort({ lastUpdated: -1 })
        .limit(limit);
    } catch (error) {
      logger.error('Error finding active tokens', error);
      throw error;
    }
  }

  async findTokensByCreator(creatorAddress: string, limit: number = 10): Promise<ITokenDocument[]> {
    try {
      return await this.model
        .find({ creator: creatorAddress })
        .sort({ createdAt: -1 })
        .limit(limit);
    } catch (error) {
      logger.error(`Error finding tokens by creator: ${creatorAddress}`, error);
      throw error;
    }
  }

  async findTopPerformingTokens(limit: number = 10): Promise<ITokenDocument[]> {
    try {
      return await this.model
        .find({})
        .sort({ 'metrics.volumeGrowthRate': -1 })
        .limit(limit);
    } catch (error) {
      logger.error('Error finding top performing tokens', error);
      throw error;
    }
  }

  async findNewestTokens(limit: number = 10): Promise<ITokenDocument[]> {
    try {
      return await this.model
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit);
    } catch (error) {
      logger.error('Error finding newest tokens', error);
      throw error;
    }
  }

  async findTokensWithHighVolume(limit: number = 10): Promise<ITokenDocument[]> {
    try {
      return await this.model
        .find({ 'metrics.currentVolume': { $gt: 1000 } }) // Volume > 1000 SOL
        .sort({ 'metrics.currentVolume': -1 })
        .limit(limit);
    } catch (error) {
      logger.error('Error finding tokens with high volume', error);
      throw error;
    }
  }

  async findTokensWithHighHolderCount(limit: number = 10): Promise<ITokenDocument[]> {
    try {
      return await this.model
        .find({ holderCount: { $gt: 100 } }) // More than 100 holders
        .sort({ holderCount: -1 })
        .limit(limit);
    } catch (error) {
      logger.error('Error finding tokens with high holder count', error);
      throw error;
    }
  }

  async findTokensWithHighLiquidity(limit: number = 10): Promise<ITokenDocument[]> {
    try {
      return await this.model
        .find({ liquidityAmount: { $gt: 100 } }) // Liquidity > 100 SOL
        .sort({ liquidityAmount: -1 })
        .limit(limit);
    } catch (error) {
      logger.error('Error finding tokens with high liquidity', error);
      throw error;
    }
  }

  async findTokensByPattern(pattern: string, limit: number = 10): Promise<ITokenDocument[]> {
    try {
      const regex = new RegExp(pattern, 'i'); // Case-insensitive search
      return await this.model
        .find({
          $or: [
            { name: { $regex: regex } },
            { symbol: { $regex: regex } },
            { mintAddress: { $regex: regex } }
          ]
        })
        .limit(limit);
    } catch (error) {
      logger.error(`Error finding tokens by pattern: ${pattern}`, error);
      throw error;
    }
  }

  async deleteToken(mintAddress: string): Promise<boolean> {
    try {
      const result = await this.model.deleteOne({ mintAddress });
      if (result.deletedCount === 0) {
        throw new Error(`Token not found: ${mintAddress}`);
      }
      logger.info(`Token deleted: ${mintAddress}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting token: ${mintAddress}`, error);
      throw error;
    }
  }

  async findHighPotential(limit: number = 10, minScore: number = 70): Promise<ITokenDocument[]> {
    try {
      return await this.model
        .find({ potentialScore: { $gte: minScore } })
        .sort({ potentialScore: -1 })
        .limit(limit);
    } catch (error) {
      logger.error('Error finding high potential tokens', error);
      throw error;
    }
  }

  async findNearGraduation(limit: number = 10): Promise<ITokenDocument[]> {
    try {
      return await this.model
        .find({ isNearGraduation: true })
        .sort({ potentialScore: -1 })
        .limit(limit);
    } catch (error) {
      logger.error('Error finding tokens near graduation', error);
      throw error;
    }
  }

  async findGraduated(limit: number = 10): Promise<ITokenDocument[]> {
    try {
      return await this.model
        .find({ isGraduated: true })
        .sort({ graduatedAt: -1 })
        .limit(limit);
    } catch (error) {
      logger.error('Error finding graduated tokens', error);
      throw error;
    }
  }

  async search(query: string, limit: number = 10): Promise<ITokenDocument[]> {
    try {
      const searchRegex = new RegExp(query, 'i');
      return await this.model
        .find({
          $or: [
            { name: searchRegex },
            { symbol: searchRegex },
            { mintAddress: searchRegex }
          ]
        })
        .limit(limit);
    } catch (error) {
      logger.error(`Error searching tokens with query: ${query}`, error);
      throw error;
    }
  }

  async updatePatterns(mintAddress: string, patterns: string[]): Promise<void> {
    try {
      await this.model.updateOne(
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
      await this.model.updateOne(
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
}

// Export a singleton instance of the repository
const tokenRepository = new TokenRepository();
export default tokenRepository;