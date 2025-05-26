import Token from '../models/token';
import logger from '../utils/logger';

export class ScoringService {
  /**
   * Calculate fundamentals score for a token
   * @param token The token to score
   * @returns Object containing all scoring components and total score
   */
  public static async calculateFundamentalsScore(token: any): Promise<{
    liquidity: number;
    community: number;
    volume: number;
    total: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    confidence: 'Low' | 'Medium' | 'High';
  }> {
    try {
      // If token is too new, don't score it yet
      const tokenAge = Date.now() - (token.createdAt?.getTime() || Date.now());
      if (tokenAge < 60000) { // 1 minute
        return {
          liquidity: 0,
          community: 0,
          volume: 0,
          total: 0,
          grade: 'F',
          confidence: 'Low'
        };
      }

      // Calculate individual scores (0-100 scale)
      const liquidityScore = this.scoreLiquidity(token.liquidityAmount || 0);
      const communityScore = this.scoreCommunity(token.holderCount || 0);
      const volumeScore = this.scoreVolume(token.currentVolume || 0);
      const totalScore = liquidityScore + communityScore + volumeScore;

      // Determine grade and confidence
      const grade = this.getGrade(totalScore);
      const tokenAgeMs = Date.now() - (token.createdAt?.getTime() || Date.now());
      const confidence = this.getConfidence(totalScore, tokenAgeMs);

      // Update token with score
      await this.updateTokenScore(token, {
        liquidity: liquidityScore,
        community: communityScore,
        volume: volumeScore,
        total: totalScore,
        grade,
        confidence
      });

      // Log and potentially alert on high scores
      if (totalScore >= 80) {
        logger.info(`High scoring token detected: ${token.name} (${token.symbol}) - Score: ${totalScore} (${grade})`);
        await this.triggerHighScoreAlert(token, totalScore);
      }

      return {
        liquidity: liquidityScore,
        community: communityScore,
        volume: volumeScore,
        total: totalScore,
        grade,
        confidence
      };
    } catch (error) {
      logger.error('Error calculating fundamentals score:', error);
      return {
        liquidity: 0,
        community: 0,
        volume: 0,
        total: 0,
        grade: 'F',
        confidence: 'Low'
      };
    }
  }

  /**
   * Score liquidity (0-40 points)
   * - >$100K = 40 points
   * - $50K-100K = 25 points
   * - <$50K = 10 points
   * @param liquidity Total liquidity in USD
   * @returns Score between 0-40
   */
  private static scoreLiquidity(liquidity: number | undefined | null): number {
    // Handle missing or invalid values
    if (typeof liquidity !== 'number' || liquidity < 0 || isNaN(liquidity)) {
      return 0; // Default to lowest score for invalid data
    }
    
    if (liquidity > 100000) return 40;
    if (liquidity >= 50000) return 25;
    return 10;
  }

  /**
   * Score community strength (0-30 points)
   * - >2.5K holders = 30 points
   * - 1K-2.5K = 15 points
   * - <1K = 5 points
   * @param holders Number of token holders
   * @returns Score between 0-30
   */
  private static scoreCommunity(holders: number | undefined | null): number {
    // Handle missing or invalid values
    if (typeof holders !== 'number' || holders < 0 || isNaN(holders)) {
      return 0; // Default to lowest score for invalid data
    }
    
    if (holders > 2500) return 30;
    if (holders >= 1000) return 15;
    return 5;
  }

  /**
   * Score volume sustainability (0-30 points)
   * - >$50K daily = 30 points
   * - $25K-50K = 15 points
   * - <$25K = 5 points
   * @param dailyVolume 24h trading volume in USD
   * @returns Score between 0-30
   */
  private static scoreVolume(dailyVolume: number | undefined | null): number {
    // Handle missing or invalid values
    if (typeof dailyVolume !== 'number' || dailyVolume < 0 || isNaN(dailyVolume)) {
      return 0; // Default to lowest score for invalid data
    }
    
    if (dailyVolume > 50000) return 30;
    if (dailyVolume >= 25000) return 15;
    return 5;
  }

  /**
   * Convert total score to letter grade
   */
  private static getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 80) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    if (score >= 30) return 'D';
    return 'F';
  }

  /**
   * Determine confidence level based on score and token age
   * @param score Total score (0-100)
   * @param tokenAgeMs Age of token in milliseconds
   * @returns Confidence level (High/Medium/Low)
   */
  private static getConfidence(score: number, tokenAgeMs: number): 'High' | 'Medium' | 'Low' {
    // Base confidence on score
    let baseConfidence: 'High' | 'Medium' | 'Low';
    if (score >= 70) baseConfidence = 'High';
    else if (score >= 40) baseConfidence = 'Medium';
    else return 'Low';

    // Adjust for token age
    const tokenAgeHours = tokenAgeMs / (1000 * 60 * 60);
    
    // Tokens under 1 hour old = Low confidence
    if (tokenAgeHours < 1) return 'Low';
    
    // Tokens under 12 hours = Max Medium confidence
    if (tokenAgeHours < 12 && baseConfidence === 'High') {
      return 'Medium';
    }
    
    return baseConfidence;
  }

  /**
   * Update token with score in the database
   */
  private static async updateTokenScore(
    token: any,
    scoreData: {
      liquidity: number;
      community: number;
      volume: number;
      total: number;
      grade: 'A' | 'B' | 'C' | 'D' | 'F';
      confidence: 'Low' | 'Medium' | 'High';
    }
  ): Promise<void> {
    try {
      await Token.findByIdAndUpdate(token._id, {
        $set: {
          'fundamentalsScore.liquidity': scoreData.liquidity,
          'fundamentalsScore.community': scoreData.community,
          'fundamentalsScore.volume': scoreData.volume,
          'fundamentalsScore.total': scoreData.total,
          'fundamentalsScore.grade': scoreData.grade,
          'fundamentalsScore.confidence': scoreData.confidence,
          'fundamentalsScore.lastUpdated': new Date(),
          lastUpdated: new Date()
        }
      });
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
