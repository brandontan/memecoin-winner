import { Request, Response } from 'express';
import { Token, TokenStatus } from '../models/token';
import logger from '../utils/logger';

interface TokenQueryParams {
  status?: string;
  minScore?: string | number;
  maxScore?: string | number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: string | number;
  limit?: string | number;
  query?: string;
}

class TokenController {
  /**
   * Get token by address
   */
  async getToken(req: Request, res: Response): Promise<void> {
    try {
      const { address } = req.params;
      const token = await Token.findOne({ 
        address: address.toUpperCase(),
        isActive: true 
      });

      if (!token) {
        res.status(404).json({ 
          success: false, 
          error: 'Token not found' 
        });
        return;
      }

      res.json({ success: true, data: token });
    } catch (error) {
      logger.error('Error fetching token:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch token' 
      });
    }
  }

  /**
   * List tokens with filtering and pagination
   */
  async listTokens(req: Request, res: Response): Promise<void> {
    try {
      const { 
        status, 
        minScore = 0, 
        maxScore = 100,
        sortBy = 'score',
        sortOrder = 'desc',
        page = 1,
        limit = 20
      } = req.query;

      // Build query
      const query: any = { isActive: true };
      
      if (status && Object.values(TokenStatus).includes(status as TokenStatus)) {
        query.status = status;
      }
      
      query.score = { 
        $gte: Number(minScore), 
        $lte: Number(maxScore) 
      };

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);
      const sortOptions: any = { [sortBy as string]: sortOrder === 'desc' ? -1 : 1 };
      
      const [tokens, total] = await Promise.all([
        Token.find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        Token.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: tokens,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      logger.error('Error listing tokens:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to list tokens' 
      });
    }
  }

  /**
   * Get high potential tokens
   */
  async getHighPotential(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.query;
      const tokens = await Token.findHighPotential(Number(limit));
      res.json({ success: true, data: tokens });
    } catch (error) {
      logger.error('Error getting high potential tokens:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get high potential tokens' 
      });
    }
  }

  /**
   * Get trending tokens
   */
  async getTrending(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.query;
      const tokens = await Token.findTrending(Number(limit));
      res.json({ success: true, data: tokens });
    } catch (error) {
      logger.error('Error getting trending tokens:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get trending tokens' 
      });
    }
  }

  /**
   * Search tokens
   */
  async searchTokens(req: Request, res: Response): Promise<void> {
    try {
      const { query, limit = 20 } = req.query;
      
      if (!query || typeof query !== 'string') {
        res.status(400).json({ 
          success: false, 
          error: 'Search query is required' 
        });
        return;
      }

      const tokens = await Token.search(query, Number(limit));
      res.json({ success: true, data: tokens });
    } catch (error) {
      logger.error('Error searching tokens:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to search tokens' 
      });
    }
  }

  /**
   * Get tokens near graduation
   */
  async getNearGraduation(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.query;
      const tokens = await Token.findNearGraduation(Number(limit));
      res.json({ success: true, data: tokens });
    } catch (error) {
      logger.error('Error getting tokens near graduation:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get tokens near graduation' 
      });
    }
  }

  /**
   * Get tokens by creator
   */
  async getByCreator(req: Request, res: Response): Promise<void> {
    try {
      const { creator } = req.params;
      const tokens = await Token.findByCreator(creator);
      res.json({ success: true, data: tokens });
    } catch (error) {
      logger.error('Error getting tokens by creator:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get tokens by creator' 
      });
    }
  }
}

export const tokenController = new TokenController();
