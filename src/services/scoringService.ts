import { Token, TokenStatus } from '../models/token';
import logger from '../utils/logger';

export class ScoringService {
  // Weights for different factors in the score (0-1)
  private static readonly WEIGHTS = {
    volume: 0.4,
    holderGrowth: 0.3,
    priceMomentum: 0.3
  };

  // Time window for scoring (in milliseconds)
  private static readonly SCORING_WINDOW = 5 * 60 * 1000; // 5 minutes

  /**
   * Calculate a score for a token based on its activity
   * @param token The token to score
   * @returns Promise with the score (0-100)
   */
  public static async calculateScore(token: any): Promise<number> {
    try {
      // If token is too new, don't score it yet
      const tokenAge = Date.now() - token.createdAt.getTime();
      if (tokenAge < 60000) { // 1 minute
        return 0;
      }

      // Normalize metrics (0-1 scale)
      const volumeScore = this.normalize(
        token.metrics.volume24h,
        0,      // min expected volume
        1000000  // max expected volume ($1M)
      );

      const holderScore = this.normalize(
        token.metrics.holders,
        0,      // min holders
        1000     // max expected holders in first window
      );

      const priceChangeScore = this.normalize(
        token.metrics.priceChange1h || 0,
        -0.5,   // can go down 50%
        10       // or up 1000%
      );

      // Calculate weighted score
      let score = 0;
      score += volumeScore * this.WEIGHTS.volume;
      score += holderScore * this.WEIGHTS.holderGrowth;
      score += priceChangeScore * this.WEIGHTS.priceMomentum;

      // Convert to 0-100 scale
      score = Math.round(score * 100);

      // Cap at 100
      return Math.min(100, Math.max(0, score));
    } catch (error) {
      logger.error('Error calculating score:', error);
      return 0;
    }
  }

  /**
   * Update a token's score and status
   */
  public static async updateTokenScore(token: any): Promise<void> {
    try {
      const score = await this.calculateScore(token);
      
      // Determine status based on score
      let status = TokenStatus.NEW;
      if (score >= 80) status = TokenStatus.STRONG;
      else if (score >= 50) status = TokenStatus.WATCH;

      // Update token with new score and status
      await token.updateScore(score, this.calculateConfidence(token));
      
      logger.info(`Updated score for ${token.symbol}: ${score}/100 (${status})`);
      
      // If score is high, trigger alerts
      if (score >= 80) {
        await this.triggerHighScoreAlert(token, score);
      }
    } catch (error) {
      logger.error('Error updating token score:', error);
    }
  }

  /**
   * Calculate confidence in the score (0-1)
   */
  private static calculateConfidence(token: any): number {
    const tokenAge = Date.now() - token.createdAt.getTime();
    const ageFactor = Math.min(1, tokenAge / (5 * 60 * 1000)); // 0-1 based on 5min window
    
    // More data points = higher confidence
    const dataPoints = Math.min(1, token.history.length / 10);
    
    // Average of age and data confidence
    return (ageFactor * 0.6) + (dataPoints * 0.4);
  }

  /**
   * Trigger alerts for high-scoring tokens
   */
  private static async triggerHighScoreAlert(token: any, score: number): Promise<void> {
    // TODO: Implement actual alerting system
    logger.info(`🚨 HIGH SCORE ALERT: ${token.symbol} scored ${score}/100!`);
    
    // In a real implementation, this would:
    // 1. Send push notifications
    // 2. Update WebSocket clients
    // 3. Possibly send emails/SMS
  }

  /**
   * Normalize a value to 0-1 range based on expected min/max
   */
  private static normalize(value: number, min: number, max: number): number {
    return Math.min(1, Math.max(0, (value - min) / (max - min)));
  }
}
