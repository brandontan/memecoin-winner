import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { CoinTracker, TrackingPhase } from '../services/coinTracker';
import Token, { IToken, TokenStatus } from '../models/token';
import logger from '../utils/logger';

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    destroy: jest.fn()
  }))
}));

describe('24-Hour Time Progression Simulation', () => {
  let mongoServer: MongoMemoryServer;
  let coinTracker: CoinTracker;
  let highPerformerToken: IToken;
  let averageToken: IToken;
  let poorPerformerToken: IToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Token.deleteMany({});
    coinTracker = new CoinTracker();
    
    // Create high performer token
    highPerformerToken = await Token.create({
      address: 'HIGH_PERFORMER_123',
      name: 'MoonCoin',
      symbol: 'MOON',
      creator: 'CREATOR_HIGH',
      status: TokenStatus.NEW,
      score: 50,
      confidence: 0.5,
      signals: ['early_volume_spike'],
      metrics: {
        priceUSD: 0.001,
        volume24h: 5000,
        holders: 25,
        liquiditySOL: 100,
        marketCap: 2500
      },
      history: [{
        timestamp: new Date(),
        price: 0.001,
        volume: 5000,
        holders: 25,
        liquidity: 100
      }],
      categories: ['meme'],
      isActive: true
    });

    // Create average performer token
    averageToken = await Token.create({
      address: 'AVERAGE_TOKEN_456',
      name: 'MidCoin',
      symbol: 'MID',
      creator: 'CREATOR_MID',
      status: TokenStatus.NEW,
      score: 45,
      confidence: 0.4,
      signals: [],
      metrics: {
        priceUSD: 0.0005,
        volume24h: 1000,
        holders: 10,
        liquiditySOL: 50,
        marketCap: 500
      },
      history: [{
        timestamp: new Date(),
        price: 0.0005,
        volume: 1000,
        holders: 10,
        liquidity: 50
      }],
      categories: ['meme'],
      isActive: true
    });

    // Create poor performer token
    poorPerformerToken = await Token.create({
      address: 'POOR_PERFORMER_789',
      name: 'RugCoin',
      symbol: 'RUG',
      creator: 'CREATOR_RUG',
      status: TokenStatus.NEW,
      score: 30,
      confidence: 0.2,
      signals: ['low_liquidity_warning'],
      metrics: {
        priceUSD: 0.0001,
        volume24h: 100,
        holders: 5,
        liquiditySOL: 10,
        marketCap: 50
      },
      history: [{
        timestamp: new Date(),
        price: 0.0001,
        volume: 100,
        holders: 5,
        liquidity: 10
      }],
      categories: ['meme'],
      isActive: true
    });
  });

  afterEach(async () => {
    await coinTracker.stopTracking(highPerformerToken.address);
    await coinTracker.stopTracking(averageToken.address);
    await coinTracker.stopTracking(poorPerformerToken.address);
  });

  describe('Complete 24-Hour Lifecycle Simulation', () => {
    it('should simulate entire lifecycle for high performer (Grade A)', async () => {
      const trackingEvents: any[] = [];
      const phaseTransitions: any[] = [];
      const evaluations: any[] = [];

      coinTracker.on('trackingStarted', (data) => trackingEvents.push({ type: 'started', ...data }));
      coinTracker.on('phaseTransition', (data) => phaseTransitions.push(data));
      coinTracker.on('24hourEvaluation', (data) => evaluations.push(data));

      // Start tracking
      await coinTracker.startTracking(highPerformerToken.address);

      // Simulate exceptional growth over 24 hours
      await simulateHighPerformanceGrowth(highPerformerToken);

      // Fast-forward through entire 24-hour cycle
      await coinTracker.mockTimeProgression(highPerformerToken.address, 24.5);

      // Verify tracking started
      expect(trackingEvents).toHaveLength(1);
      expect(trackingEvents[0].phase).toBe(TrackingPhase.INTENSIVE);

      // Verify phase transitions
      expect(phaseTransitions).toHaveLength(2);
      expect(phaseTransitions[0].newPhase).toBe(TrackingPhase.ACTIVE);
      expect(phaseTransitions[1].newPhase).toBe(TrackingPhase.EVALUATION);

      // Verify 24-hour evaluation
      expect(evaluations).toHaveLength(1);
      expect(evaluations[0].grade).toMatch(/[AB]/); // Should get A or B grade
      expect(evaluations[0].score).toBeGreaterThanOrEqual(80);
      expect(evaluations[0].willContinueTracking).toBe(true);

      // Verify final token state
      const finalToken = await Token.findOne({ address: highPerformerToken.address });
      expect(finalToken?.score).toBeGreaterThanOrEqual(80);
      expect(finalToken?.history.length).toBeGreaterThan(10); // Should have accumulated data
    });

    it('should simulate lifecycle for average performer (Grade C)', async () => {
      const evaluations: any[] = [];
      coinTracker.on('24hourEvaluation', (data) => evaluations.push(data));

      await coinTracker.startTracking(averageToken.address);

      // Simulate moderate growth
      await simulateAveragePerformanceGrowth(averageToken);

      // Fast-forward 24 hours
      await coinTracker.mockTimeProgression(averageToken.address, 24.5);

      // Verify evaluation
      expect(evaluations).toHaveLength(1);
      expect(evaluations[0].grade).toMatch(/[CD]/);
      expect(evaluations[0].score).toBeLessThan(80);
      expect(evaluations[0].willContinueTracking).toBe(false);

      // Should be archived
      const finalToken = await Token.findOne({ address: averageToken.address });
      expect(finalToken?.isActive).toBe(false);
    });

    it('should simulate lifecycle for poor performer (Grade F)', async () => {
      const evaluations: any[] = [];
      coinTracker.on('24hourEvaluation', (data) => evaluations.push(data));

      await coinTracker.startTracking(poorPerformerToken.address);

      // Simulate poor/declining performance
      await simulatePoorPerformance(poorPerformerToken);

      // Fast-forward 24 hours
      await coinTracker.mockTimeProgression(poorPerformerToken.address, 24.5);

      // Verify evaluation
      expect(evaluations).toHaveLength(1);
      expect(evaluations[0].grade).toBe('F');
      expect(evaluations[0].score).toBeLessThan(60);
      expect(evaluations[0].willContinueTracking).toBe(false);
    });
  });

  describe('Phase-Specific Time Progression', () => {
    it('should respect 2-minute intervals in intensive phase', async () => {
      await coinTracker.startTracking(highPerformerToken.address);
      
      const initialHistory = highPerformerToken.history.length;
      
      // Progress 30 minutes (should trigger ~15 updates at 2-min intervals)
      await coinTracker.mockTimeProgression(highPerformerToken.address, 0.5);
      
      const updatedToken = await Token.findOne({ address: highPerformerToken.address });
      const newHistory = updatedToken?.history.length || 0;
      
      // Should have significantly more data points
      expect(newHistory).toBeGreaterThan(initialHistory + 10);
      
      // Should still be in intensive phase
      const status = coinTracker.getTrackingStatus();
      expect(status.find(s => s.address === highPerformerToken.address)?.phase).toBe(TrackingPhase.INTENSIVE);
    });

    it('should transition to 15-minute intervals in active phase', async () => {
      await coinTracker.startTracking(highPerformerToken.address);
      
      // Progress to active phase (2.5 hours)
      await coinTracker.mockTimeProgression(highPerformerToken.address, 2.5);
      
      const status = coinTracker.getTrackingStatus();
      expect(status.find(s => s.address === highPerformerToken.address)?.phase).toBe(TrackingPhase.ACTIVE);
      
      // Progress another hour in active phase
      const token = await Token.findOne({ address: highPerformerToken.address });
      const historyBefore = token?.history.length || 0;
      
      await coinTracker.mockTimeProgression(highPerformerToken.address, 1);
      
      const updatedToken = await Token.findOne({ address: highPerformerToken.address });
      const historyAfter = updatedToken?.history.length || 0;
      
      // Should have fewer updates than intensive phase (4 updates in 1 hour at 15-min intervals)
      const newUpdates = historyAfter - historyBefore;
      expect(newUpdates).toBeLessThan(15); // Less frequent than intensive phase
      expect(newUpdates).toBeGreaterThan(0);
    });

    it('should handle 30-minute intervals in evaluation phase', async () => {
      await coinTracker.startTracking(highPerformerToken.address);
      
      // Progress to evaluation phase (13 hours)
      await coinTracker.mockTimeProgression(highPerformerToken.address, 13);
      
      const status = coinTracker.getTrackingStatus();
      expect(status.find(s => s.address === highPerformerToken.address)?.phase).toBe(TrackingPhase.EVALUATION);
    });
  });

  describe('Data Accumulation During Time Progression', () => {
    it('should accumulate realistic historical data', async () => {
      await coinTracker.startTracking(highPerformerToken.address);
      
      // Progress through entire lifecycle
      await coinTracker.mockTimeProgression(highPerformerToken.address, 24);
      
      const finalToken = await Token.findOne({ address: highPerformerToken.address });
      
      // Should have substantial history
      expect(finalToken?.history.length).toBeGreaterThan(50);
      
      // History should be chronologically ordered
      const timestamps = finalToken?.history.map(h => h.timestamp.getTime()) || [];
      expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
      
      // Should have realistic data variations
      const prices = finalToken?.history.map(h => h.price) || [];
      const volumes = finalToken?.history.map(h => h.volume) || [];
      
      expect(Math.max(...prices)).toBeGreaterThan(Math.min(...prices));
      expect(Math.max(...volumes)).toBeGreaterThan(Math.min(...volumes));
    });

    it('should maintain consistent score progression', async () => {
      const momentumAlerts: any[] = [];
      coinTracker.on('momentumAlert', (data) => momentumAlerts.push(data));

      await coinTracker.startTracking(highPerformerToken.address);
      await simulateHighPerformanceGrowth(highPerformerToken);
      
      // Progress and check for momentum changes
      await coinTracker.mockTimeProgression(highPerformerToken.address, 24);
      
      const finalToken = await Token.findOne({ address: highPerformerToken.address });
      
      // Score should have improved
      expect(finalToken?.score).toBeGreaterThan(50);
      
      // Should have generated momentum alerts
      expect(momentumAlerts.length).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Token Tracking', () => {
    it('should handle multiple tokens with different lifecycles', async () => {
      const allEvaluations: any[] = [];
      coinTracker.on('24hourEvaluation', (data) => allEvaluations.push(data));

      // Start tracking all three tokens
      await coinTracker.startTracking(highPerformerToken.address);
      await coinTracker.startTracking(averageToken.address);
      await coinTracker.startTracking(poorPerformerToken.address);

      // Set up different performance patterns
      await simulateHighPerformanceGrowth(highPerformerToken);
      await simulateAveragePerformanceGrowth(averageToken);
      await simulatePoorPerformance(poorPerformerToken);

      // Progress all tokens through 24 hours
      await Promise.all([
        coinTracker.mockTimeProgression(highPerformerToken.address, 24.5),
        coinTracker.mockTimeProgression(averageToken.address, 24.5),
        coinTracker.mockTimeProgression(poorPerformerToken.address, 24.5)
      ]);

      // All should have been evaluated
      expect(allEvaluations).toHaveLength(3);
      
      // Verify different outcomes
      const grades = allEvaluations.map(e => e.grade);
      expect(new Set(grades).size).toBeGreaterThan(1); // Should have different grades
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle time progression with missing token', async () => {
      await coinTracker.startTracking(highPerformerToken.address);
      
      // Delete token mid-tracking
      await Token.deleteOne({ address: highPerformerToken.address });
      
      // Should not throw error
      await expect(
        coinTracker.mockTimeProgression(highPerformerToken.address, 1)
      ).resolves.not.toThrow();
    });

    it('should prevent time progression in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await coinTracker.startTracking(highPerformerToken.address);
      
      await expect(
        coinTracker.mockTimeProgression(highPerformerToken.address, 1)
      ).rejects.toThrow('Mock time progression only available in test environment');

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle extreme time progression gracefully', async () => {
      await coinTracker.startTracking(highPerformerToken.address);
      
      // Try progressing 100 hours (should cap at reasonable limits)
      await expect(
        coinTracker.mockTimeProgression(highPerformerToken.address, 100)
      ).resolves.not.toThrow();
    });
  });

  // Helper functions for simulating different performance patterns
  async function simulateHighPerformanceGrowth(token: IToken): Promise<void> {
    // Simulate viral growth pattern
    const growthStages = [
      { price: 0.002, volume: 10000, holders: 50, liquidity: 200 },
      { price: 0.005, volume: 25000, holders: 100, liquidity: 500 },
      { price: 0.01, volume: 50000, holders: 200, liquidity: 1000 },
      { price: 0.02, volume: 100000, holders: 500, liquidity: 2000 },
      { price: 0.05, volume: 200000, holders: 1000, liquidity: 5000 }
    ];

    for (const stage of growthStages) {
      await token.updateMetrics({
        priceUSD: stage.price,
        volume24h: stage.volume,
        holders: stage.holders,
        liquiditySOL: stage.liquidity,
        marketCap: stage.price * 1000000
      });
    }
  }

  async function simulateAveragePerformanceGrowth(token: IToken): Promise<void> {
    // Simulate modest, inconsistent growth
    const stages = [
      { price: 0.0006, volume: 1500, holders: 12, liquidity: 60 },
      { price: 0.0008, volume: 2000, holders: 15, liquidity: 80 },
      { price: 0.0007, volume: 1800, holders: 18, liquidity: 75 }, // Slight dip
      { price: 0.001, volume: 2500, holders: 25, liquidity: 100 },
      { price: 0.0012, volume: 3000, holders: 30, liquidity: 120 }
    ];

    for (const stage of stages) {
      await token.updateMetrics({
        priceUSD: stage.price,
        volume24h: stage.volume,
        holders: stage.holders,
        liquiditySOL: stage.liquidity,
        marketCap: stage.price * 1000000
      });
    }
  }

  async function simulatePoorPerformance(token: IToken): Promise<void> {
    // Simulate declining/stagnant performance
    const stages = [
      { price: 0.00008, volume: 80, holders: 4, liquidity: 8 },
      { price: 0.00006, volume: 60, holders: 3, liquidity: 6 },
      { price: 0.00004, volume: 40, holders: 2, liquidity: 4 },
      { price: 0.00002, volume: 20, holders: 1, liquidity: 2 },
      { price: 0.00001, volume: 10, holders: 1, liquidity: 1 }
    ];

    for (const stage of stages) {
      await token.updateMetrics({
        priceUSD: stage.price,
        volume24h: stage.volume,
        holders: stage.holders,
        liquiditySOL: stage.liquidity,
        marketCap: stage.price * 1000000
      });
    }
  }
});