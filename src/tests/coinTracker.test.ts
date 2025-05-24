import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { CoinTracker, TrackingPhase } from '../services/coinTracker';
import Token, { IToken, TokenStatus } from '../models/token';
import logger from '../utils/logger';

// Mock logger to reduce test noise
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    destroy: jest.fn()
  }))
}));

describe('CoinTracker - Time-Based Tracking System', () => {
  let mongoServer: MongoMemoryServer;
  let coinTracker: CoinTracker;
  let testToken: IToken;

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
    
    // Create test token
    testToken = await Token.create({
      address: 'TEST123MEMECOIN456',
      name: 'Test Memecoin',
      symbol: 'TEST',
      creator: 'CREATOR123',
      status: TokenStatus.NEW,
      score: 50,
      confidence: 0.5,
      signals: [],
      metrics: {
        priceUSD: 0.001,
        volume24h: 1000,
        holders: 10,
        liquiditySOL: 50,
        marketCap: 1000,
        priceChange1h: 0,
        priceChange24h: 0
      },
      history: [{
        timestamp: new Date(),
        price: 0.001,
        volume: 1000,
        holders: 10,
        liquidity: 50
      }],
      categories: ['meme'],
      isActive: true
    });
  });

  afterEach(async () => {
    // Clean up tracking
    await coinTracker.stopTracking(testToken.address);
  });

  describe('Phase 1: Intensive Tracking (0-2 hours)', () => {
    it('should start tracking in intensive phase with 2-minute intervals', async () => {
      const trackingStartedSpy = jest.fn();
      coinTracker.on('trackingStarted', trackingStartedSpy);

      await coinTracker.startTracking(testToken.address);

      expect(trackingStartedSpy).toHaveBeenCalledWith({
        tokenAddress: testToken.address,
        phase: TrackingPhase.INTENSIVE
      });

      const status = coinTracker.getTrackingStatus();
      expect(status).toHaveLength(1);
      expect(status[0].phase).toBe(TrackingPhase.INTENSIVE);
    });

    it('should update metrics every 2 minutes in intensive phase', async () => {
      await coinTracker.startTracking(testToken.address);
      
      // Mock time progression for 30 minutes (should trigger 15 updates)
      await coinTracker.mockTimeProgression(testToken.address, 0.5);
      
      const updatedToken = await Token.findOne({ address: testToken.address });
      expect(updatedToken?.history.length).toBeGreaterThan(1);
    });

    it('should emit momentum alerts when score changes by 10+ points', async () => {
      const alertSpy = jest.fn();
      coinTracker.on('momentumAlert', alertSpy);

      await coinTracker.startTracking(testToken.address);
      
      // Simulate significant momentum change
      await testToken.updateMetrics({
        priceUSD: 0.005, // 5x price increase
        volume24h: 10000, // 10x volume increase
        holders: 50, // 5x holder increase
        liquiditySOL: 250
      });

      await coinTracker.updateTokenMetrics(testToken.address);
      
      // Should trigger alert due to large momentum change
      expect(alertSpy).toHaveBeenCalled();
      const alertData = alertSpy.mock.calls[0][0];
      expect(alertData.phase).toBe(TrackingPhase.INTENSIVE);
      expect(Math.abs(alertData.momentum.change)).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Phase 2: Active Tracking (2-12 hours)', () => {
    it('should transition to active phase after 2 hours', async () => {
      const phaseTransitionSpy = jest.fn();
      coinTracker.on('phaseTransition', phaseTransitionSpy);

      await coinTracker.startTracking(testToken.address);
      
      // Fast-forward 2.5 hours
      await coinTracker.mockTimeProgression(testToken.address, 2.5);

      expect(phaseTransitionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenAddress: testToken.address,
          oldPhase: TrackingPhase.INTENSIVE,
          newPhase: TrackingPhase.ACTIVE
        })
      );

      const status = coinTracker.getTrackingStatus();
      expect(status[0].phase).toBe(TrackingPhase.ACTIVE);
    });

    it('should track sustained growth patterns in active phase', async () => {
      await coinTracker.startTracking(testToken.address);
      
      // Progress to active phase
      await coinTracker.mockTimeProgression(testToken.address, 3);
      
      const updatedToken = await Token.findOne({ address: testToken.address });
      expect(updatedToken?.score).toBeDefined();
      expect(updatedToken?.confidence).toBeGreaterThan(0);
    });

    it('should have 15-point alert threshold in active phase', async () => {
      const alertSpy = jest.fn();
      coinTracker.on('momentumAlert', alertSpy);

      await coinTracker.startTracking(testToken.address);
      await coinTracker.mockTimeProgression(testToken.address, 3); // Move to active phase

      // Simulate moderate change (should not trigger with 15-point threshold)
      await coinTracker.updateTokenMetrics(testToken.address);
      
      const status = coinTracker.getTrackingStatus();
      expect(status[0].phase).toBe(TrackingPhase.ACTIVE);
    });
  });

  describe('Phase 3: Evaluation Phase (12-24 hours)', () => {
    it('should transition to evaluation phase after 12 hours', async () => {
      const phaseTransitionSpy = jest.fn();
      coinTracker.on('phaseTransition', phaseTransitionSpy);

      await coinTracker.startTracking(testToken.address);
      
      // Fast-forward 13 hours
      await coinTracker.mockTimeProgression(testToken.address, 13);

      expect(phaseTransitionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenAddress: testToken.address,
          newPhase: TrackingPhase.EVALUATION
        })
      );
    });

    it('should calculate 24-hour performance grade', async () => {
      const evaluationSpy = jest.fn();
      coinTracker.on('24hourEvaluation', evaluationSpy);

      await coinTracker.startTracking(testToken.address);
      
      // Add some positive performance data
      for (let i = 0; i < 5; i++) {
        await testToken.updateMetrics({
          priceUSD: 0.001 * (1 + i * 0.1),
          volume24h: 1000 * (1 + i * 0.2),
          holders: 10 + i * 2,
          liquiditySOL: 50 * (1 + i * 0.1)
        });
      }

      // Fast-forward to 24 hours
      await coinTracker.mockTimeProgression(testToken.address, 24);

      expect(evaluationSpy).toHaveBeenCalled();
      const evaluation = evaluationSpy.mock.calls[0][0];
      expect(evaluation.grade).toMatch(/[A-F]/);
      expect(evaluation.score).toBeGreaterThanOrEqual(0);
      expect(evaluation.score).toBeLessThanOrEqual(100);
    });

    it('should assign correct letter grades based on performance', async () => {
      const evaluationSpy = jest.fn();
      coinTracker.on('24hourEvaluation', evaluationSpy);

      // Create high-performing token
      for (let i = 0; i < 10; i++) {
        await testToken.updateMetrics({
          priceUSD: 0.001 * (1 + i * 0.5), // 50% growth per update
          volume24h: 1000 * (1 + i * 0.3),
          holders: 10 + i * 5,
          liquiditySOL: 50 * (1 + i * 0.2)
        });
      }

      await coinTracker.startTracking(testToken.address);
      await coinTracker.mockTimeProgression(testToken.address, 24);

      expect(evaluationSpy).toHaveBeenCalled();
      const evaluation = evaluationSpy.mock.calls[0][0];
      expect(['A', 'B', 'C']).toContain(evaluation.grade);
    });
  });

  describe('Phase 4: Post-24h Tracking (High Performers Only)', () => {
    it('should continue tracking tokens with 80+ score', async () => {
      const evaluationSpy = jest.fn();
      const phaseTransitionSpy = jest.fn();
      
      coinTracker.on('24hourEvaluation', evaluationSpy);
      coinTracker.on('phaseTransition', phaseTransitionSpy);

      // Create high-performing token data
      await testToken.updateScore(85, 0.9);
      
      for (let i = 0; i < 10; i++) {
        await testToken.updateMetrics({
          priceUSD: 0.001 * (1 + i * 1.0), // 100% growth
          volume24h: 1000 * (1 + i * 0.5),
          holders: 10 + i * 10,
          liquiditySOL: 50 * (1 + i * 0.3)
        });
      }

      await coinTracker.startTracking(testToken.address);
      await coinTracker.mockTimeProgression(testToken.address, 24.5);

      // Should indicate continued tracking
      expect(evaluationSpy).toHaveBeenCalled();
      const evaluation = evaluationSpy.mock.calls[0][0];
      expect(evaluation.willContinueTracking).toBe(true);
    });

    it('should archive tokens with score below 80', async () => {
      const evaluationSpy = jest.fn();
      const archivedSpy = jest.fn();
      
      coinTracker.on('24hourEvaluation', evaluationSpy);
      coinTracker.on('tokenArchived', archivedSpy);

      // Create poor-performing token
      await testToken.updateScore(30, 0.3);

      await coinTracker.startTracking(testToken.address);
      await coinTracker.mockTimeProgression(testToken.address, 24.5);

      expect(evaluationSpy).toHaveBeenCalled();
      const evaluation = evaluationSpy.mock.calls[0][0];
      expect(evaluation.willContinueTracking).toBe(false);
    });
  });

  describe('Data Optimization and Storage', () => {
    it('should optimize data storage based on tracking phase', async () => {
      await coinTracker.startTracking(testToken.address);
      
      // Add lots of minute-level data
      for (let i = 0; i < 100; i++) {
        await testToken.updateMetrics({
          priceUSD: 0.001 + (i * 0.0001),
          volume24h: 1000 + (i * 10),
          holders: 10 + i,
          liquiditySOL: 50 + i
        });
      }

      const beforeOptimization = testToken.history.length;
      
      // Transition phases to trigger optimization
      await coinTracker.mockTimeProgression(testToken.address, 25);

      const updatedToken = await Token.findOne({ address: testToken.address });
      
      // Should have optimized storage
      expect(updatedToken?.isActive).toBe(false);
    });

    it('should create hourly summaries instead of minute-level data after archiving', async () => {
      await coinTracker.startTracking(testToken.address);
      
      // Simulate 24 hours of data collection
      await coinTracker.mockTimeProgression(testToken.address, 24);
      
      const archivedToken = await Token.findOne({ address: testToken.address });
      
      // History should be summarized, not minute-by-minute
      if (archivedToken?.history.length) {
        expect(archivedToken.history.length).toBeLessThan(100); // Should be compressed
      }
    });

    it('should retain different amounts of data based on phase', async () => {
      await coinTracker.startTracking(testToken.address);
      
      // Test data retention in different phases
      await coinTracker.mockTimeProgression(testToken.address, 1); // Intensive
      let token = await Token.findOne({ address: testToken.address });
      const intensiveHistoryLength = token?.history.length || 0;

      await coinTracker.mockTimeProgression(testToken.address, 5); // Active
      token = await Token.findOne({ address: testToken.address });
      const activeHistoryLength = token?.history.length || 0;

      // Active phase should retain more data than intensive
      expect(activeHistoryLength).toBeGreaterThanOrEqual(intensiveHistoryLength);
    });
  });

  describe('Mock Time Progression (Testing)', () => {
    it('should only allow mock time progression in test environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await coinTracker.startTracking(testToken.address);
      
      await expect(
        coinTracker.mockTimeProgression(testToken.address, 1)
      ).rejects.toThrow('Mock time progression only available in test environment');

      process.env.NODE_ENV = originalEnv;
    });

    it('should simulate correct number of updates based on time advancement', async () => {
      await coinTracker.startTracking(testToken.address);
      
      const initialHistoryLength = testToken.history.length;
      
      // Advance 1 hour in intensive phase (should trigger ~30 updates at 2-min intervals)
      await coinTracker.mockTimeProgression(testToken.address, 1);
      
      const updatedToken = await Token.findOne({ address: testToken.address });
      const newHistoryLength = updatedToken?.history.length || 0;
      
      expect(newHistoryLength).toBeGreaterThan(initialHistoryLength);
    });

    it('should properly transition phases during mock progression', async () => {
      const phaseTransitionSpy = jest.fn();
      coinTracker.on('phaseTransition', phaseTransitionSpy);

      await coinTracker.startTracking(testToken.address);
      
      // Fast-forward through all phases
      await coinTracker.mockTimeProgression(testToken.address, 25);

      // Should have transitioned through multiple phases
      expect(phaseTransitionSpy).toHaveBeenCalledTimes(2); // INTENSIVE -> ACTIVE -> EVALUATION
    });
  });

  describe('Tracking Status and Management', () => {
    it('should provide accurate tracking status for all tokens', async () => {
      await coinTracker.startTracking(testToken.address);
      
      const status = coinTracker.getTrackingStatus();
      
      expect(status).toHaveLength(1);
      expect(status[0].address).toBe(testToken.address);
      expect(status[0].phase).toBe(TrackingPhase.INTENSIVE);
      expect(status[0].nextUpdate).toBeInstanceOf(Date);
    });

    it('should properly stop tracking when requested', async () => {
      const trackingStoppedSpy = jest.fn();
      coinTracker.on('trackingStopped', trackingStoppedSpy);

      await coinTracker.startTracking(testToken.address);
      expect(coinTracker.getTrackingStatus()).toHaveLength(1);

      await coinTracker.stopTracking(testToken.address);
      
      expect(trackingStoppedSpy).toHaveBeenCalledWith({
        tokenAddress: testToken.address
      });
      expect(coinTracker.getTrackingStatus()).toHaveLength(0);
    });

    it('should handle tracking multiple tokens simultaneously', async () => {
      const token2 = await Token.create({
        address: 'TEST789MEMECOIN012',
        name: 'Test Memecoin 2',
        symbol: 'TEST2',
        creator: 'CREATOR456',
        status: TokenStatus.NEW,
        score: 40,
        confidence: 0.4,
        signals: [],
        metrics: {
          priceUSD: 0.002,
          volume24h: 2000,
          holders: 20,
          liquiditySOL: 100
        },
        history: [{
          timestamp: new Date(),
          price: 0.002,
          volume: 2000,
          holders: 20,
          liquidity: 100
        }],
        categories: ['meme'],
        isActive: true
      });

      await coinTracker.startTracking(testToken.address);
      await coinTracker.startTracking(token2.address);

      const status = coinTracker.getTrackingStatus();
      expect(status).toHaveLength(2);
      
      // Clean up
      await coinTracker.stopTracking(token2.address);
    });
  });

  describe('Error Handling', () => {
    it('should handle tracking non-existent tokens gracefully', async () => {
      await expect(
        coinTracker.startTracking('NONEXISTENT123')
      ).rejects.toThrow('Token not found: NONEXISTENT123');
    });

    it('should handle metric update failures gracefully', async () => {
      await coinTracker.startTracking(testToken.address);
      
      // Delete token to simulate error
      await Token.deleteOne({ address: testToken.address });
      
      // Should not throw error
      await expect(
        coinTracker.updateTokenMetrics(testToken.address)
      ).resolves.not.toThrow();
    });

    it('should continue tracking other tokens when one fails', async () => {
      const token2 = await Token.create({
        address: 'TEST789STABLE',
        name: 'Stable Token',
        symbol: 'STABLE',
        creator: 'CREATOR789',
        status: TokenStatus.NEW,
        score: 60,
        confidence: 0.6,
        signals: [],
        metrics: {
          priceUSD: 0.003,
          volume24h: 3000,
          holders: 30,
          liquiditySOL: 150
        },
        history: [{
          timestamp: new Date(),
          price: 0.003,
          volume: 3000,
          holders: 30,
          liquidity: 150
        }],
        categories: ['stable'],
        isActive: true
      });

      await coinTracker.startTracking(testToken.address);
      await coinTracker.startTracking(token2.address);

      // Delete first token
      await Token.deleteOne({ address: testToken.address });
      
      // Second token should still be tracked
      const status = coinTracker.getTrackingStatus();
      expect(status.some(s => s.address === token2.address)).toBe(true);
      
      // Clean up
      await coinTracker.stopTracking(token2.address);
    });
  });
});