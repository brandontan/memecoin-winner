const Token = require('../models/token');
const logger = require('../utils/logger');
const config = require('../config');

class ScoringService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
  }

  start() {
    if (this.isRunning) {
      logger.warn('Scoring service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting scoring service...');

    // Update scores every 30 seconds
    this.intervalId = setInterval(() => {
      this.updateAllScores();
    }, 30000);

    logger.info('Scoring service started');
  }

  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    logger.info('Scoring service stopped');
  }

  async updateAllScores() {
    try {
      // Get all tokens that haven't been alerted yet and are less than 24 hours old
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tokens = await Token.find({
        launchTime: { $gte: oneDayAgo },
        alertSent: false
      });

      logger.info(`Updating scores for ${tokens.length} tokens`);

      for (const token of tokens) {
        await this.updateTokenScore(token);
      }

    } catch (error) {
      logger.error('Error updating scores:', error);
    }
  }

  async updateTokenScore(token) {
    try {
      // Get fresh metrics (in production, this would call real APIs)
      const metrics = await this.getLatestMetrics(token.address);
      
      // Update token metrics
      token.volume = metrics.volume || token.volume;
      token.buyers = metrics.buyers || token.buyers;
      token.priceUSD = metrics.price || token.priceUSD;

      // Calculate new score using the simple formula: volume × buyers ÷ time_hours
      const oldScore = token.score;
      token.calculateScore();

      // Save if score changed significantly
      if (Math.abs(token.score - oldScore) >= 5) {
        await token.save();
        logger.info(`Score updated for ${token.symbol}: ${oldScore} → ${token.score}`);

        // Check if should trigger alert
        if (token.shouldAlert()) {
          this.triggerAlert(token);
        }
      }

    } catch (error) {
      logger.error(`Error updating score for token ${token.address}:`, error);
    }
  }

  async getLatestMetrics(tokenAddress) {
    // Placeholder for real API integration
    // In production, integrate with Jupiter, Birdeye, or DEX APIs
    
    // Simulate some realistic metric growth
    const baseVolume = Math.random() * 50000;
    const baseBuyers = Math.floor(Math.random() * 200);
    const basePrice = Math.random() * 0.05;

    return {
      volume: baseVolume,
      buyers: baseBuyers,
      price: basePrice
    };
  }

  triggerAlert(token) {
    logger.info(`🚨 SCORING ALERT: ${token.name} (${token.symbol}) reached score ${token.score}!`);
    logger.info(`   Reason: Formula = (${token.volume} × ${token.buyers}) ÷ ${this.getHoursSinceLaunch(token)} hours`);
    logger.info(`   Address: ${token.address}`);
    
    // Mark alert as sent
    token.markAlertSent();

    // In production: send push notifications, webhooks, emails
    this.sendNotification(token);
  }

  getHoursSinceLaunch(token) {
    return Math.max(0.1, (Date.now() - token.launchTime) / (1000 * 60 * 60));
  }

  sendNotification(token) {
    // Placeholder for notification system
    // In production: integrate with push notification service, webhooks, etc.
    
    const notification = {
      type: 'HIGH_SCORE_ALERT',
      token: {
        name: token.name,
        symbol: token.symbol,
        address: token.address,
        score: token.score
      },
      timestamp: new Date(),
      message: `🚨 NEW HIGH-POTENTIAL COIN: ${token.name} (Score: ${token.score}/100)`
    };

    logger.info('Notification sent:', notification);
  }

  // Utility method to get top scoring tokens
  async getTopTokens(limit = 10) {
    try {
      return await Token.find({ alertSent: false })
        .sort({ score: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      logger.error('Error getting top tokens:', error);
      return [];
    }
  }

  // Utility method to get recent alerts
  async getRecentAlerts(limit = 20) {
    try {
      return await Token.find({ alertSent: true })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      logger.error('Error getting recent alerts:', error);
      return [];
    }
  }
}

module.exports = new ScoringService();