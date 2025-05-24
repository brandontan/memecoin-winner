import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';
import logger from '../utils/logger';

interface ErrorResponse {
  success: boolean;
  error: string;
  details?: ValidationError[];
}

export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const response: ErrorResponse = {
      success: false,
      error: 'Validation failed',
      details: errors.array()
    };
    
    logger.warn('Request validation failed:', {
      path: req.path,
      method: req.method,
      errors: errors.array()
    });
    
    res.status(400).json(response);
    return;
  }
  
  next();
};
