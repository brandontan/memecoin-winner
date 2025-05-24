import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import trackingService, { TrackingAlert, TrackingDashboard } from '../services/trackingService';
import logger from '../utils/logger';

const router = Router();

// Types
type AlertType = 'momentum' | 'phase_transition' | '24h_evaluation' | 'graduation';
type PriorityType = 'low' | 'medium' | 'high' | 'critical';
type TimeframeType = '1h' | '6h' | '24h' | '7d';

interface AlertFilter {
  type?: AlertType;
  priority?: PriorityType;
  since?: Date;
  tokenAddress?: string;
  limit?: number;
}

// Validation middleware
const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
};

// Helper function for error handling
const handleError = (res: Response, error: unknown, context: string): void => {
  const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
  logger.error(`${context}:`, error);
  res.status(500).json({
    success: false,
    error: errorMessage
  });
};

// Dashboard route
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const dashboard = await trackingService.getDashboard();
    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    handleError(res, error, 'Failed to get tracking dashboard');
  }
});

// Start tracking a token
router.post('/start', [
  body('tokenAddress').isString().notEmpty().withMessage('Token address is required')
], validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tokenAddress } = req.body;
    await trackingService.startTracking(tokenAddress);
    res.json({
      success: true,
      message: `Started tracking token: ${tokenAddress}`,
      data: { tokenAddress }
    });
  } catch (error) {
    handleError(res, error, 'Failed to start tracking token');
  }
});

// Stop tracking a token
router.post('/stop', [
  body('tokenAddress').isString().notEmpty().withMessage('Token address is required')
], validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tokenAddress } = req.body;
    await trackingService.stopTracking(tokenAddress);
    res.json({
      success: true,
      message: `Stopped tracking token: ${tokenAddress}`,
      data: { tokenAddress }
    });
  } catch (error) {
    handleError(res, error, 'Failed to stop tracking token');
  }
});

// Get token info
router.get('/token/:address', [
  param('address').isString().notEmpty().withMessage('Token address is required')
], validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { address } = req.params;
    const trackingInfo = await trackingService.getTokenTrackingInfo(address);
    res.json({
      success: true,
      data: trackingInfo
    });
  } catch (error) {
    handleError(res, error, 'Failed to get token tracking info');
  }
});

// Get alerts
router.get('/alerts', [
  query('type').optional().isIn(['momentum', 'phase_transition', '24h_evaluation', 'graduation']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('since').optional().isISO8601().withMessage('Since must be a valid ISO date'),
  query('tokenAddress').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
], validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, priority, since, tokenAddress, limit = '100' } = req.query;
    
    const filters: AlertFilter = {
      ...(type && { type: type as AlertType }),
      ...(priority && { priority: priority as PriorityType }),
      ...(since && { since: new Date(since as string) }),
      ...(tokenAddress && { tokenAddress: tokenAddress as string }),
      limit: parseInt(limit as string, 10)
    };
    
    // Get recent alerts from the dashboard
    const dashboard = await trackingService.getDashboard();
    let alerts = dashboard.recentAlerts || [];
    
    // Apply filters
    if (filters.type) {
      alerts = alerts.filter(alert => alert.type === filters.type);
    }
    if (filters.priority) {
      alerts = alerts.filter(alert => alert.priority === filters.priority);
    }
    if (filters.since) {
      const sinceDate = new Date(filters.since);
      alerts = alerts.filter(alert => new Date(alert.timestamp) >= sinceDate);
    }
    if (filters.tokenAddress) {
      alerts = alerts.filter(alert => alert.tokenAddress === filters.tokenAddress);
    }
    
    // Apply limit
    alerts = alerts.slice(0, filters.limit);
    
    res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to get alerts');
  }
});

// Get analytics
router.get('/analytics', [
  query('timeframe').optional().isIn(['1h', '6h', '24h', '7d']).withMessage('Invalid timeframe')
], validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeframe = '24h' } = req.query;
    const analytics = await trackingService.getAnalytics(timeframe as TimeframeType);
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    handleError(res, error, 'Failed to get analytics');
  }
});

// Trigger evaluation
router.post('/evaluate', async (req: Request, res: Response): Promise<void> => {
  try {
    await trackingService.triggerEvaluation();
    res.json({
      success: true,
      message: 'Evaluation triggered successfully'
    });
  } catch (error) {
    handleError(res, error, 'Failed to trigger evaluation');
  }
});

// Maintenance operations
router.post('/maintenance', [
  body('operation').isString().isIn(['cleanup']).withMessage('Invalid operation'),
  body('params').optional().isObject()
], validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { operation } = req.body;
    
    if (operation === 'cleanup') {
      await trackingService.performMaintenance();
      res.json({
        success: true,
        message: 'Maintenance cleanup completed successfully'
      });
    } else {
      throw new Error('Unsupported operation');
    }
  } catch (error) {
    handleError(res, error, 'Maintenance operation failed');
  }
});

// Event stream for real-time updates
router.get('/events', (req: Request, res: Response): void => {
  // Set headers for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: ' + JSON.stringify({ type: 'connected', message: 'Connected to tracking service' }) + '\n\n');

  // Handle alerts from tracking service
  const alertHandler = (alert: TrackingAlert): void => {
    try {
      res.write('data: ' + JSON.stringify({ type: 'alert', data: alert }) + '\n\n');
    } catch (error) {
      logger.error('Error sending SSE:', error);
    }
  };

  // Set up event listeners
  trackingService.on('alert', alertHandler);

  // Send periodic heartbeat
  const heartbeat = setInterval(() => {
    try {
      res.write('data: ' + JSON.stringify({ 
        type: 'heartbeat', 
        timestamp: new Date().toISOString() 
      }) + '\n\n');
    } catch (error) {
      logger.error('Error sending heartbeat:', error);
    }
  }, 30000);

  // Clean up on client disconnect
  const cleanup = (): void => {
    clearInterval(heartbeat);
    trackingService.off('alert', alertHandler);
    res.end();
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
});

// Get overall tracking system status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const dashboard = await trackingService.getDashboard();
    const analytics = await trackingService.getAnalytics('1h');
    
    res.json({
      success: true,
      data: {
        status: 'operational',
        lastUpdated: new Date().toISOString(),
        stats: {
          activeTracking: dashboard.activeTracking,
          recentAlerts: dashboard.recentAlerts?.length || 0,
          topPerformers: dashboard.topPerformers?.length || 0,
          graduatedToday: dashboard.graduatedToday || 0,
          successRate: analytics.successRate || 0
        },
        uptime: process.uptime()
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to get system status');
  }
});

// Export tracking data
router.get('/export', [
  query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
  query('timeframe').optional().isIn(['1h', '6h', '24h', '7d']).withMessage('Invalid timeframe'),
  query('includeHistory').optional().isBoolean().withMessage('Include history must be boolean')
], validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      format = 'json', 
      timeframe = '24h', 
      includeHistory = 'false' 
    } = req.query as {
      format?: 'json' | 'csv';
      timeframe?: TimeframeType;
      includeHistory?: string;
    };
    
    const analytics = await trackingService.getAnalytics(timeframe as TimeframeType);
    const dashboard = await trackingService.getDashboard();
    const alerts = dashboard.recentAlerts || [];
    
    const exportData = {
      metadata: {
        exportedAt: new Date(),
        timeframe,
        includeHistory: includeHistory === 'true'
      },
      analytics,
      alerts,
      summary: {
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.priority === 'critical').length,
        averageScore: analytics.averageScore,
        successRate: analytics.successRate
      }
    };
    
    if (format === 'csv') {
      // Convert to CSV format
      const csv = [
        'timestamp,type,priority,tokenAddress',
        ...alerts.map(alert => [
          alert.timestamp.toISOString(),
          alert.type,
          alert.priority,
          alert.tokenAddress
        ].join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="tracking-export-${timeframe}.csv"`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="tracking-export-${timeframe}.json"`);
      res.json(exportData);
    }
  } catch (error) {
    handleError(res, error, 'Failed to export tracking data');
  }
});

export default router;