import { Request, Response } from 'express';
import Token from '../models/token';

class ApiController {
  // Health check endpoint
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json({
        status: 'success',
        message: 'API is working',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    } catch (error) {
      this.handleError(res, error as Error);
    }
  };

  // Get latest tokens
  public getLatestTokens = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const tokens = await Token.find()
        .sort({ createdAt: -1 })
        .limit(limit);
      
      res.status(200).json({
        status: 'success',
        results: tokens.length,
        data: tokens
      });
    } catch (error) {
      this.handleError(res, error as Error);
    }
  };

  // Get token by address
  public getTokenByAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      const { address } = req.params;
      
      if (!address) {
        res.status(400).json({
          status: 'error',
          message: 'Token address is required'
        });
        return;
      }

      const token = await Token.findOne({ mintAddress: address });
      
      if (!token) {
        res.status(404).json({
          status: 'error',
          message: 'Token not found'
        });
        return;
      }
      
      res.status(200).json({
        status: 'success',
        data: token
      });
    } catch (error) {
      this.handleError(res, error as Error);
    }
  };

  // Error handler helper
  private handleError(res: Response, error: Error): void {
    console.error('API Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export default new ApiController();
