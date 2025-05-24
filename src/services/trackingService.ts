import coinTracker, { CoinTracker, TrackingPhase } from './coinTracker';
import Token, { IToken, TokenStatus } from '../models/token';
import logger from '../utils/logger';
import { EventEmitter } from 'events';

export interface TrackingAlert {
  type: 'momentum' | 'phase_transition' | '24h_evaluation' | 'graduation';
  tokenAddress: string;
  data: any;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface TrackingDashboard {
  activeTracking: {
    intensive: number;
    active: number;
    evaluation: number;
    post24h: number;
  };
  recentAlerts: TrackingAlert[];
  topPerformers: Array<{
    address: string;
    score: number;
    grade: string;
    phase: TrackingPhase;
  }>;
  graduatedToday: number;
}

class TrackingService extends EventEmitter {
  private alerts: TrackingAlert[] = [];
  private maxAlerts = 1000;

  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * Initialize tracking service and resume existing tracking
   */
  async initialize(): Promise<void> {
    try {
      // Resume tracking for active tokens created in last 24 hours
      const recentTokens = await Token.find({
        isActive: true,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      for (const token of recentTokens) {
        const ageHours = (Date.now() - token.createdAt.getTime()) / (1000 * 60 * 60);
        
        if (ageHours < 24) {
          await this.startTracking(token.address);
          logger.info(`Resumed tracking for token: ${token.address} (age: ${ageHours.toFixed(1)}h)`);
        }
      }

      logger.info(`TrackingService initialized, resumed tracking for ${recentTokens.length} tokens`);
    } catch (error) {
      logger.error('Failed to initialize TrackingService:', error);
    }
  }

  /**
   * Start tracking a new token
   */
  async startTracking(tokenAddress: string): Promise<void> {
    try {
      await coinTracker.startTracking(tokenAddress);
      logger.info(`Started tracking: ${tokenAddress}`);
    } catch (error) {
      logger.error(`Failed to start tracking ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Stop tracking a token
   */
  async stopTracking(tokenAddress: string): Promise<void> {
    try {
      await coinTracker.stopTracking(tokenAddress);
      logger.info(`Stopped tracking: ${tokenAddress}`);
    } catch (error) {
      logger.error(`Failed to stop tracking ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Get comprehensive tracking dashboard data
   */
  async getDashboard(): Promise<TrackingDashboard> {
    try {
      const trackingStatus = coinTracker.getTrackingStatus();
      
      // Count tokens by phase
      const phaseCount = trackingStatus.reduce((acc, status) => {
        acc[status.phase] = (acc[status.phase] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Get top performers from last 24 hours
      const topPerformers = await Token.find({
        isActive: true,
        score: { $gte: 70 },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
      .sort({ score: -1 })
      .limit(10)
      .lean();

      // Count graduations today
      const graduatedToday = await Token.countDocuments({
        status: TokenStatus.GRADUATED,
        graduatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      return {
        activeTracking: {
          intensive: phaseCount[TrackingPhase.INTENSIVE] || 0,
          active: phaseCount[TrackingPhase.ACTIVE] || 0,
          evaluation: phaseCount[TrackingPhase.EVALUATION] || 0,
          post24h: phaseCount[TrackingPhase.POST_24H] || 0
        },
        recentAlerts: this.alerts.slice(-50).reverse(),
        topPerformers: topPerformers.map(token => ({
          address: token.address,
          score: token.score,
          grade: this.scoreToGrade(token.score),
          phase: this.getTokenPhase(token.address)
        })),
        graduatedToday
      };
    } catch (error) {
      logger.error('Failed to generate dashboard:', error);
      throw error;
    }
  }

  /**
   * Get alerts filtered by criteria
   */
  getAlerts(filters?: {
    type?: string;
    priority?: string;
    since?: Date;
    tokenAddress?: string;
  }): TrackingAlert[] {
    let filteredAlerts = [...this.alerts];

    if (filters) {
      if (filters.type) {
        filteredAlerts = filteredAlerts.filter(a => a.type === filters.type);
      }
      if (filters.priority) {
        filteredAlerts = filteredAlerts.filter(a => a.priority === filters.priority);
      }
      if (filters.since) {
        filteredAlerts = filteredAlerts.filter(a => a.timestamp >= filters.since!);
      }
      if (filters.tokenAddress) {
        filteredAlerts = filteredAlerts.filter(a => a.tokenAddress === filters.tokenAddress);
      }
    }

    return filteredAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get detailed tracking info for a specific token
   */
  async getTokenTrackingInfo(tokenAddress: string): Promise<{
    token: IToken | null;
    phase: TrackingPhase | null;
    nextUpdate: Date | null;
    alerts: TrackingAlert[];
    timeline: Array<{
      phase: TrackingPhase;
      startTime: Date;
      endTime?: Date;
      duration?: string;
    }>;
  }> {
    const token = await Token.findOne({ address: tokenAddress });
    const trackingStatus = coinTracker.getTrackingStatus();
    const tokenStatus = trackingStatus.find(s => s.address === tokenAddress);
    const tokenAlerts = this.getAlerts({ tokenAddress });

    // Generate phase timeline
    const timeline = this.generatePhaseTimeline(token, tokenStatus);

    return {
      token,
      phase: tokenStatus?.phase || null,
      nextUpdate: tokenStatus?.nextUpdate || null,
      alerts: tokenAlerts,
      timeline
    };
  }

  /**
   * Manually trigger evaluation for tokens near 24h mark
   */
  async triggerEvaluation(): Promise<void> {
    const tokens = await Token.find({
      isActive: true,
      createdAt: {
        $gte: new Date(Date.now() - 25 * 60 * 60 * 1000),
        $lte: new Date(Date.now() - 23 * 60 * 60 * 1000)
      }
    });

    for (const token of tokens) {
      try {
        await coinTracker.updateTokenMetrics(token.address);
      } catch (error) {
        logger.error(`Failed to trigger evaluation for ${token.address}:`, error);
      }
    }

    logger.info(`Triggered evaluation for ${tokens.length} tokens`);
  }

  /**
   * Clean up old data and optimize storage
   */
  async performMaintenance(): Promise<void> {
    try {
      // Remove old alerts
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      this.alerts = this.alerts.filter(alert => alert.timestamp > cutoffDate);

      // Archive old tokens that are no longer being tracked
      const oldTokens = await Token.find({
        isActive: false,
        createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      });

      for (const token of oldTokens) {
        // Keep only essential data for historical analysis
        token.history = token.history.slice(-24); // Keep last 24 data points
        await token.save();
      }

      logger.info(`Maintenance completed: cleaned ${this.alerts.length} alerts, optimized ${oldTokens.length} archived tokens`);
    } catch (error) {
      logger.error('Maintenance failed:', error);
    }
  }

  /**
   * Get performance analytics
   */
  async getAnalytics(timeframe: '1h' | '6h' | '24h' | '7d' = '24h'): Promise<{
    totalTracked: number;
    graduated: number;
    successRate: number;
    averageScore: number;
    alertsGenerated: number;
    phaseDistribution: Record<TrackingPhase, number>;
    topGrades: Record<string, number>;
  }> {
    const cutoff = this.getTimeframeCutoff(timeframe);
    
    const tokens = await Token.find({
      createdAt: { $gte: cutoff }
    });

    const graduated = tokens.filter(t => t.status === TokenStatus.GRADUATED).length;
    const averageScore = tokens.reduce((sum, t) => sum + t.score, 0) / tokens.length || 0;
    
    const alertsInTimeframe = this.alerts.filter(a => a.timestamp >= cutoff);
    
    const trackingStatus = coinTracker.getTrackingStatus();
    const phaseDistribution = trackingStatus.reduce((acc, status) => {
      acc[status.phase] = (acc[status.phase] || 0) + 1;
      return acc;
    }, {} as Record<TrackingPhase, number>);

    const topGrades = tokens.reduce((acc, token) => {
      const grade = this.scoreToGrade(token.score);
      acc[grade] = (acc[grade] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalTracked: tokens.length,
      graduated,
      successRate: tokens.length > 0 ? (graduated / tokens.length) * 100 : 0,
      averageScore: Math.round(averageScore),
      alertsGenerated: alertsInTimeframe.length,
      phaseDistribution,
      topGrades
    };
  }

  /**
   * Setup event listeners for CoinTracker events
   */
  private setupEventListeners(): void {
    coinTracker.on('trackingStarted', (data) => {
      this.addAlert({
        type: 'phase_transition',
        tokenAddress: data.tokenAddress,
        data: { message: 'Tracking started', phase: data.phase },
        priority: 'low'
      });
    });

    coinTracker.on('momentumAlert', (data) => {
      const priority = Math.abs(data.momentum.change) >= 30 ? 'critical' : 
                      Math.abs(data.momentum.change) >= 20 ? 'high' : 'medium';
                      
      this.addAlert({
        type: 'momentum',
        tokenAddress: data.tokenAddress,
        data: {
          momentum: data.momentum,
          phase: data.phase,
          score: data.token.score
        },
        priority
      });
    });

    coinTracker.on('phaseTransition', (data) => {
      this.addAlert({
        type: 'phase_transition',
        tokenAddress: data.tokenAddress,
        data: {
          oldPhase: data.oldPhase,
          newPhase: data.newPhase,
          message: `Transitioned from ${data.oldPhase} to ${data.newPhase}`
        },
        priority: 'medium'
      });
    });

    coinTracker.on('24hourEvaluation', (data) => {
      const priority = data.grade === 'A' ? 'critical' : 
                      data.grade === 'B' ? 'high' : 
                      data.grade === 'C' ? 'medium' : 'low';

      this.addAlert({
        type: '24h_evaluation',
        tokenAddress: data.tokenAddress,
        data: {
          grade: data.grade,
          score: data.score,
          willContinueTracking: data.willContinueTracking,
          message: `24h evaluation complete: Grade ${data.grade}`
        },
        priority
      });
    });

    coinTracker.on('tokenArchived', (data) => {
      this.addAlert({
        type: 'phase_transition',
        tokenAddress: data.tokenAddress,
        data: { message: 'Token archived', dataOptimized: data.dataOptimized },
        priority: 'low'
      });
    });
  }

  /**
   * Add alert to the system
   */
  private addAlert(alert: Omit<TrackingAlert, 'timestamp'>): void {
    const fullAlert: TrackingAlert = {
      ...alert,
      timestamp: new Date()
    };

    this.alerts.push(fullAlert);

    // Keep only recent alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    // Emit alert for real-time subscriptions
    this.emit('alert', fullAlert);
  }

  /**
   * Convert score to letter grade
   */
  private scoreToGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Get current tracking phase for a token
   */
  private getTokenPhase(tokenAddress: string): TrackingPhase {
    const status = coinTracker.getTrackingStatus();
    return status.find(s => s.address === tokenAddress)?.phase || TrackingPhase.ARCHIVED;
  }

  /**
   * Generate phase timeline for a token
   */
  private generatePhaseTimeline(token: IToken | null, currentStatus: any): Array<{
    phase: TrackingPhase;
    startTime: Date;
    endTime?: Date;
    duration?: string;
  }> {
    if (!token) return [];

    const timeline = [];
    const createdAt = token.createdAt;
    const now = new Date();

    // Intensive phase: 0-2 hours
    const intensiveEnd = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
    timeline.push({
      phase: TrackingPhase.INTENSIVE,
      startTime: createdAt,
      endTime: intensiveEnd,
      duration: '2 hours'
    });

    // Active phase: 2-12 hours
    if (now > intensiveEnd) {
      const activeEnd = new Date(createdAt.getTime() + 12 * 60 * 60 * 1000);
      timeline.push({
        phase: TrackingPhase.ACTIVE,
        startTime: intensiveEnd,
        endTime: now > activeEnd ? activeEnd : undefined,
        duration: '10 hours'
      });

      // Evaluation phase: 12-24 hours
      if (now > activeEnd) {
        const evaluationEnd = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
        timeline.push({
          phase: TrackingPhase.EVALUATION,
          startTime: activeEnd,
          endTime: now > evaluationEnd ? evaluationEnd : undefined,
          duration: '12 hours'
        });

        // Post-24h or archived
        if (now > evaluationEnd) {
          timeline.push({
            phase: token.score >= 80 ? TrackingPhase.POST_24H : TrackingPhase.ARCHIVED,
            startTime: evaluationEnd,
            endTime: undefined,
            duration: token.score >= 80 ? '7 days' : 'N/A'
          });
        }
      }
    }

    return timeline;
  }

  /**
   * Get cutoff date for timeframe
   */
  private getTimeframeCutoff(timeframe: string): Date {
    const now = Date.now();
    switch (timeframe) {
      case '1h': return new Date(now - 60 * 60 * 1000);
      case '6h': return new Date(now - 6 * 60 * 60 * 1000);
      case '24h': return new Date(now - 24 * 60 * 60 * 1000);
      case '7d': return new Date(now - 7 * 24 * 60 * 60 * 1000);
      default: return new Date(now - 24 * 60 * 60 * 1000);
    }
  }
}

export default new TrackingService();