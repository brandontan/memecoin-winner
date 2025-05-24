import { EventEmitter } from 'events';
import Token, { IToken, TokenStatus } from '../models/token';
import logger from '../utils/logger';
import { config } from '../config/config';
import cron from 'node-cron';

export enum TrackingPhase {
  INTENSIVE = 'intensive',    // 0-2 hours: every 2 minutes
  ACTIVE = 'active',         // 2-12 hours: every 15 minutes
  EVALUATION = 'evaluation', // 12-24 hours: every 30 minutes
  POST_24H = 'post_24h',     // 24h+: every 2 hours for 7 days
  ARCHIVED = 'archived'      // Tracking stopped
}

export interface TrackingMetrics {
  price: number;
  volume: number;
  holders: number;
  transactions: number;
  liquiditySOL: number;
  timestamp: Date;
}

export interface MomentumScore {
  current: number;
  change: number;
  velocity: number;
  trend: 'bullish' | 'bearish' | 'neutral';
}

export interface TrackingConfig {
  phase: TrackingPhase;
  updateInterval: number; // in milliseconds
  alertThreshold: number;
  dataRetention: number; // in hours
}

export class CoinTracker extends EventEmitter {
  private trackedTokens: Map<string, TrackingConfig> = new Map();
  private scheduledJobs: Map<string, any> = new Map();
  private phaseConfigs: Map<TrackingPhase, Partial<TrackingConfig>> = new Map([
    [TrackingPhase.INTENSIVE, { updateInterval: 2 * 60 * 1000, alertThreshold: 10, dataRetention: 2 }],
    [TrackingPhase.ACTIVE, { updateInterval: 15 * 60 * 1000, alertThreshold: 15, dataRetention: 12 }],
    [TrackingPhase.EVALUATION, { updateInterval: 30 * 60 * 1000, alertThreshold: 20, dataRetention: 24 }],
    [TrackingPhase.POST_24H, { updateInterval: 2 * 60 * 60 * 1000, alertThreshold: 25, dataRetention: 168 }]
  ]);

  constructor() {
    super();
    this.initializePhaseTransitions();
  }

  /**
   * Start tracking a new token
   */
  async startTracking(tokenAddress: string): Promise<void> {
    try {
      const token = await Token.findOne({ address: tokenAddress });
      if (!token) {
        throw new Error(`Token not found: ${tokenAddress}`);
      }

      // Start in intensive phase
      const config: TrackingConfig = {
        phase: TrackingPhase.INTENSIVE,
        updateInterval: this.phaseConfigs.get(TrackingPhase.INTENSIVE)!.updateInterval!,
        alertThreshold: this.phaseConfigs.get(TrackingPhase.INTENSIVE)!.alertThreshold!,
        dataRetention: this.phaseConfigs.get(TrackingPhase.INTENSIVE)!.dataRetention!
      };

      this.trackedTokens.set(tokenAddress, config);
      await this.scheduleUpdates(tokenAddress, config);

      // Schedule phase transitions
      this.schedulePhaseTransition(tokenAddress, TrackingPhase.ACTIVE, 2 * 60 * 60 * 1000); // 2 hours
      this.schedulePhaseTransition(tokenAddress, TrackingPhase.EVALUATION, 12 * 60 * 60 * 1000); // 12 hours
      this.schedulePhaseTransition(tokenAddress, TrackingPhase.ARCHIVED, 24 * 60 * 60 * 1000); // 24 hours

      logger.info(`Started intensive tracking for token: ${tokenAddress}`);
      this.emit('trackingStarted', { tokenAddress, phase: TrackingPhase.INTENSIVE });

    } catch (error) {
      logger.error(`Failed to start tracking for ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Stop tracking a token
   */
  async stopTracking(tokenAddress: string): Promise<void> {
    const job = this.scheduledJobs.get(tokenAddress);
    if (job) {
      job.destroy();
      this.scheduledJobs.delete(tokenAddress);
    }

    this.trackedTokens.delete(tokenAddress);
    logger.info(`Stopped tracking token: ${tokenAddress}`);
    this.emit('trackingStopped', { tokenAddress });
  }

  /**
   * Update token metrics and calculate momentum
   */
  async updateTokenMetrics(tokenAddress: string): Promise<void> {
    try {
      const token = await Token.findOne({ address: tokenAddress });
      if (!token) {
        logger.warn(`Token not found for metrics update: ${tokenAddress}`);
        return;
      }

      const config = this.trackedTokens.get(tokenAddress);
      if (!config) {
        logger.warn(`No tracking config found for: ${tokenAddress}`);
        return;
      }

      // Collect current metrics (simulate real data collection)
      const metrics = await this.collectMetrics(tokenAddress);
      
      // Update token with new metrics
      await token.updateMetrics({
        priceUSD: metrics.price,
        volume24h: metrics.volume,
        holders: metrics.holders,
        liquiditySOL: metrics.liquiditySOL
      });

      // Calculate momentum score
      const momentum = await this.calculateMomentumScore(token);
      
      // Update token score and confidence
      await token.updateScore(momentum.current, this.calculateConfidence(momentum));

      // Check for alerts
      if (Math.abs(momentum.change) >= config.alertThreshold) {
        this.emit('momentumAlert', {
          tokenAddress,
          momentum,
          phase: config.phase,
          token: token.toObject()
        });
      }

      // Check for graduation to post-24h tracking
      if (config.phase === TrackingPhase.EVALUATION) {
        await this.evaluateFor24HourGrade(token);
      }

      logger.debug(`Updated metrics for ${tokenAddress} in ${config.phase} phase`);

    } catch (error) {
      logger.error(`Failed to update metrics for ${tokenAddress}:`, error);
    }
  }

  /**
   * Transition token to new tracking phase
   */
  private async transitionPhase(tokenAddress: string, newPhase: TrackingPhase): Promise<void> {
    const currentConfig = this.trackedTokens.get(tokenAddress);
    if (!currentConfig) return;

    // Stop current tracking
    const currentJob = this.scheduledJobs.get(tokenAddress);
    if (currentJob) {
      currentJob.destroy();
    }

    if (newPhase === TrackingPhase.ARCHIVED) {
      await this.archiveToken(tokenAddress);
      this.trackedTokens.delete(tokenAddress);
      this.scheduledJobs.delete(tokenAddress);
      logger.info(`Archived token: ${tokenAddress}`);
      this.emit('tokenArchived', { tokenAddress });
      return;
    }

    // Update to new phase configuration
    const phaseConfig = this.phaseConfigs.get(newPhase)!;
    const newConfig: TrackingConfig = {
      ...currentConfig,
      phase: newPhase,
      updateInterval: phaseConfig.updateInterval!,
      alertThreshold: phaseConfig.alertThreshold!,
      dataRetention: phaseConfig.dataRetention!
    };

    this.trackedTokens.set(tokenAddress, newConfig);
    await this.scheduleUpdates(tokenAddress, newConfig);

    logger.info(`Transitioned ${tokenAddress} to ${newPhase} phase`);
    this.emit('phaseTransition', { tokenAddress, oldPhase: currentConfig.phase, newPhase });

    // Optimize data storage
    await this.optimizeDataStorage(tokenAddress, newPhase);
  }

  /**
   * Schedule updates for a token based on its phase
   */
  private async scheduleUpdates(tokenAddress: string, config: TrackingConfig): Promise<void> {
    const cronPattern = this.getCronPattern(config.updateInterval);
    
    const job = cron.schedule(cronPattern, async () => {
      await this.updateTokenMetrics(tokenAddress);
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    this.scheduledJobs.set(tokenAddress, job);
  }

  /**
   * Schedule phase transition
   */
  private schedulePhaseTransition(tokenAddress: string, newPhase: TrackingPhase, delay: number): void {
    setTimeout(async () => {
      await this.transitionPhase(tokenAddress, newPhase);
    }, delay);
  }

  /**
   * Convert milliseconds to cron pattern
   */
  private getCronPattern(intervalMs: number): string {
    const minutes = Math.floor(intervalMs / (60 * 1000));
    
    if (minutes < 60) {
      return `*/${minutes} * * * *`;
    } else {
      const hours = Math.floor(minutes / 60);
      return `0 */${hours} * * *`;
    }
  }

  /**
   * Collect real-time metrics for a token
   */
  private async collectMetrics(tokenAddress: string): Promise<TrackingMetrics> {
    // This would integrate with real APIs like Jupiter, Birdeye, etc.
    // For now, simulate realistic data
    const token = await Token.findOne({ address: tokenAddress });
    if (!token) {
      throw new Error(`Token not found: ${tokenAddress}`);
    }

    const currentMetrics = token.metrics;
    const variation = 0.1; // 10% variation
    
    return {
      price: currentMetrics.priceUSD * (1 + (Math.random() - 0.5) * variation),
      volume: currentMetrics.volume24h * (1 + (Math.random() - 0.5) * variation),
      holders: Math.max(1, currentMetrics.holders + Math.floor((Math.random() - 0.5) * 10)),
      transactions: Math.floor(Math.random() * 100) + 10,
      liquiditySOL: currentMetrics.liquiditySOL * (1 + (Math.random() - 0.5) * variation),
      timestamp: new Date()
    };
  }

  /**
   * Calculate momentum score based on historical data
   */
  private async calculateMomentumScore(token: IToken): Promise<MomentumScore> {
    const history = token.history.slice(-10); // Last 10 data points
    
    if (history.length < 2) {
      return {
        current: 50,
        change: 0,
        velocity: 0,
        trend: 'neutral'
      };
    }

    const latest = history[history.length - 1];
    const previous = history[history.length - 2];
    
    // Calculate momentum factors
    const priceChange = (latest.price - previous.price) / previous.price;
    const volumeChange = (latest.volume - previous.volume) / previous.volume;
    const holderChange = (latest.holders - previous.holders) / Math.max(previous.holders, 1);
    
    // Weighted momentum score (0-100)
    const momentum = Math.min(100, Math.max(0, 
      50 + (priceChange * 30) + (volumeChange * 20) + (holderChange * 50)
    ));
    
    const previousScore = token.score || 50;
    const change = momentum - previousScore;
    
    // Calculate velocity (rate of change)
    const timeElapsed = (latest.timestamp.getTime() - previous.timestamp.getTime()) / (1000 * 60); // minutes
    const velocity = timeElapsed > 0 ? change / timeElapsed : 0;
    
    const trend = change > 5 ? 'bullish' : change < -5 ? 'bearish' : 'neutral';
    
    return {
      current: Math.round(momentum),
      change: Math.round(change),
      velocity: Math.round(velocity * 100) / 100,
      trend
    };
  }

  /**
   * Calculate confidence based on momentum consistency
   */
  private calculateConfidence(momentum: MomentumScore): number {
    const baseConfidence = 0.5;
    const velocityFactor = Math.min(0.3, Math.abs(momentum.velocity) / 10);
    const trendFactor = momentum.trend === 'neutral' ? 0 : 0.2;
    
    return Math.min(1, baseConfidence + velocityFactor + trendFactor);
  }

  /**
   * Evaluate token performance after 24 hours and assign grade
   */
  private async evaluateFor24HourGrade(token: IToken): Promise<void> {
    const createdAt = token.createdAt;
    const now = new Date();
    const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    
    if (ageHours < 23.5) return; // Wait until close to 24 hours
    
    // Calculate 24-hour performance grade
    const grade = this.calculate24HourGrade(token);
    
    // Update token with final assessment
    await token.updateScore(grade.score, grade.confidence);
    
    // If score is 80+, continue to post-24h tracking
    if (grade.score >= 80) {
      setTimeout(async () => {
        await this.transitionPhase(token.address, TrackingPhase.POST_24H);
        // Schedule archiving after 7 days
        setTimeout(async () => {
          await this.transitionPhase(token.address, TrackingPhase.ARCHIVED);
        }, 7 * 24 * 60 * 60 * 1000);
      }, 30 * 60 * 1000); // 30 minutes after evaluation phase starts
    }
    
    this.emit('24hourEvaluation', {
      tokenAddress: token.address,
      grade: grade.letter,
      score: grade.score,
      willContinueTracking: grade.score >= 80
    });
    
    logger.info(`24-hour evaluation for ${token.address}: Grade ${grade.letter} (${grade.score})`);
  }

  /**
   * Calculate 24-hour performance grade (A-F)
   */
  private calculate24HourGrade(token: IToken): { letter: string; score: number; confidence: number } {
    const history = token.history;
    if (history.length < 5) {
      return { letter: 'F', score: 0, confidence: 0.1 };
    }

    const initial = history[0];
    const latest = history[history.length - 1];
    
    // Performance metrics
    const priceGrowth = (latest.price - initial.price) / initial.price;
    const volumeGrowth = (latest.volume - initial.volume) / Math.max(initial.volume, 1);
    const holderGrowth = (latest.holders - initial.holders) / Math.max(initial.holders, 1);
    
    // Calculate composite score
    const score = Math.min(100, Math.max(0,
      30 + (priceGrowth * 30) + (volumeGrowth * 20) + (holderGrowth * 40)
    ));
    
    // Determine letter grade
    let letter: string;
    if (score >= 90) letter = 'A';
    else if (score >= 80) letter = 'B';
    else if (score >= 70) letter = 'C';
    else if (score >= 60) letter = 'D';
    else letter = 'F';
    
    const confidence = Math.min(1, history.length / 20); // More data = higher confidence
    
    return { letter, score: Math.round(score), confidence };
  }

  /**
   * Archive token and optimize storage
   */
  private async archiveToken(tokenAddress: string): Promise<void> {
    const token = await Token.findOne({ address: tokenAddress });
    if (!token) return;

    // Keep only hourly summaries instead of minute-by-minute data
    const optimizedHistory = this.createHourlySummaries(token.history);
    token.history = optimizedHistory;
    
    // Mark as archived
    token.isActive = false;
    await token.save();
    
    this.emit('tokenArchived', { tokenAddress, dataOptimized: true });
  }

  /**
   * Optimize data storage based on tracking phase
   */
  private async optimizeDataStorage(tokenAddress: string, phase: TrackingPhase): Promise<void> {
    const token = await Token.findOne({ address: tokenAddress });
    if (!token) return;

    const config = this.phaseConfigs.get(phase);
    if (!config || !config.dataRetention) return;

    const cutoffTime = new Date(Date.now() - (config.dataRetention * 60 * 60 * 1000));
    
    // Remove data older than retention period
    token.history = token.history.filter(point => point.timestamp > cutoffTime);
    await token.save();
    
    logger.debug(`Optimized data storage for ${tokenAddress} in ${phase} phase`);
  }

  /**
   * Create hourly summaries from minute-level data
   */
  private createHourlySummaries(history: IToken['history']): IToken['history'] {
    if (history.length === 0) return [];

    const summaries: IToken['history'] = [];
    const hourlyGroups = new Map<string, typeof history>();
    
    // Group by hour
    history.forEach(point => {
      const hourKey = new Date(point.timestamp).toISOString().slice(0, 13); // YYYY-MM-DDTHH
      if (!hourlyGroups.has(hourKey)) {
        hourlyGroups.set(hourKey, []);
      }
      hourlyGroups.get(hourKey)!.push(point);
    });
    
    // Create summary for each hour
    hourlyGroups.forEach((points, hourKey) => {
      const summary = {
        timestamp: new Date(hourKey + ':00:00.000Z'),
        price: points.reduce((sum, p) => sum + p.price, 0) / points.length,
        volume: Math.max(...points.map(p => p.volume)),
        holders: Math.max(...points.map(p => p.holders)),
        liquidity: points.reduce((sum, p) => sum + p.liquidity, 0) / points.length
      };
      summaries.push(summary);
    });
    
    return summaries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Initialize automatic phase transitions for existing tokens
   */
  private initializePhaseTransitions(): void {
    // This would run on service startup to resume tracking for existing tokens
    logger.info('CoinTracker initialized with time-based tracking phases');
  }

  /**
   * Get tracking status for all tokens
   */
  getTrackingStatus(): Array<{ address: string; phase: TrackingPhase; nextUpdate: Date }> {
    const status: Array<{ address: string; phase: TrackingPhase; nextUpdate: Date }> = [];
    
    this.trackedTokens.forEach((config, address) => {
      const nextUpdate = new Date(Date.now() + config.updateInterval);
      status.push({ address, phase: config.phase, nextUpdate });
    });
    
    return status;
  }

  /**
   * Fast-forward time for testing (mock time progression)
   */
  async mockTimeProgression(tokenAddress: string, hoursToAdvance: number): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Mock time progression only available in test environment');
    }

    const config = this.trackedTokens.get(tokenAddress);
    if (!config) return;

    // Simulate updates that would have happened
    const updatesPerHour = Math.ceil(60 * 60 * 1000 / config.updateInterval);
    const totalUpdates = Math.floor(hoursToAdvance * updatesPerHour);

    for (let i = 0; i < totalUpdates; i++) {
      await this.updateTokenMetrics(tokenAddress);
      
      // Check for phase transitions
      const token = await Token.findOne({ address: tokenAddress });
      if (token) {
        const ageHours = i / updatesPerHour;
        
        if (ageHours >= 2 && config.phase === TrackingPhase.INTENSIVE) {
          await this.transitionPhase(tokenAddress, TrackingPhase.ACTIVE);
        } else if (ageHours >= 12 && config.phase === TrackingPhase.ACTIVE) {
          await this.transitionPhase(tokenAddress, TrackingPhase.EVALUATION);
        } else if (ageHours >= 24 && config.phase === TrackingPhase.EVALUATION) {
          await this.evaluateFor24HourGrade(token);
        }
      }
    }

    logger.info(`Mock time progression: advanced ${hoursToAdvance} hours for ${tokenAddress}`);
  }
}

export default new CoinTracker();