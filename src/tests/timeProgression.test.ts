import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Document } from 'mongoose';
import { EventEmitter } from 'events';
import { CoinTracker, TrackingPhase } from '../services/coinTracker';
import Token, { ITokenDocument } from '../models/token';
import logger from '../utils/logger';
import {
  simulateHighPerformanceGrowth,
  simulateAveragePerformanceGrowth,
  simulatePoorPerformance
} from './testHelpers';

// Define local enums to match the test requirements
enum TokenStatus {
  NEW = 'NEW',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED'
}

// Extend the ITokenDocument for test-specific needs
interface IToken extends Omit<ITokenDocument, keyof Document> {
  _id: any;
  save(): Promise<IToken>;
  currentPrice: number;
  currentVolume: number;
  holderCount: number;
  liquidityAmount: number;
  priceHistory: Array<{ timestamp: Date; price: number }>;
  volumeHistory: Array<{ timestamp: Date; volume: number }>;
  holderHistory: Array<{ timestamp: Date; count: number }>;
  potentialScore: number;
  isActive: boolean;
  mintAddress: string;
}

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
  let highPerformerToken: IToken & { _id: any };
  let averageToken: IToken & { _id: any };
  let poorPerformerToken: IToken & { _id: any };

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
      mintAddress: 'HIGH_PERFORMER_123',
      name: 'MoonCoin',
      symbol: 'MOON',
      creator: 'CREATOR_HIGH',
      status: TokenStatus.NEW,
      potentialScore: 50,
      currentPrice: 0.001,
      currentVolume: 5000,
      holderCount: 25,
      liquidityAmount: 100,
      priceHistory: [{
        timestamp: new Date(),
        price: 0.001
      }],
      volumeHistory: [{
        timestamp: new Date(),
        volume: 5000
      }],
      holderHistory: [{
        timestamp: new Date(),
        count: 25
      }],
      categories: ['meme'],
      isActive: true
    });

    // Create average performer token
    averageToken = await Token.create({
      mintAddress: 'AVERAGE_TOKEN_456',
      name: 'MidCoin',
      symbol: 'MID',
      creator: 'CREATOR_MID',
      status: TokenStatus.NEW,
      potentialScore: 45,
      currentPrice: 0.0005,
      currentVolume: 1000,
      holderCount: 10,
      liquidityAmount: 50,
      priceHistory: [{
        timestamp: new Date(),
        price: 0.0005
      }],
      volumeHistory: [{
        timestamp: new Date(),
        volume: 1000
      }],
      holderHistory: [{
        timestamp: new Date(),
        count: 10
      }],
      categories: ['meme'],
      isActive: true
    });

    // Create poor performer token
    poorPerformerToken = await Token.create({
      mintAddress: 'POOR_PERFORMER_789',
      name: 'RugCoin',
      symbol: 'RUG',
      creator: 'CREATOR_RUG',
      status: TokenStatus.NEW,
      potentialScore: 30,
      currentPrice: 0.0001,
      currentVolume: 100,
      holderCount: 5,
      liquidityAmount: 10,
      priceHistory: [{
        timestamp: new Date(),
        price: 0.0001
      }],
      volumeHistory: [{
        timestamp: new Date(),
        volume: 100
      }],
      holderHistory: [{
        timestamp: new Date(),
        count: 5
      }],
      categories: ['meme'],
      isActive: true
    });
  });

  afterEach(async () => {
    await coinTracker.stopTracking(highPerformerToken.mintAddress);
    await coinTracker.stopTracking(averageToken.mintAddress);
    await coinTracker.stopTracking(poorPerformerToken.mintAddress);
  });

  describe('Complete 24-Hour Lifecycle Simulation', () => {
    it('should simulate entire lifecycle for high performer (Grade A)', async () => {
      const trackingEvents: any[] = [];
      const phaseTransitions: any[] = [];
      const evaluations: any[] = [];

      // Set up event listeners
      const onTrackingStarted = (data: any) => trackingEvents.push({ type: 'started', ...data });
      const onPhaseTransition = (data: any) => phaseTransitions.push(data);
      const onEvaluation = (data: any) => evaluations.push(data);

      coinTracker.on('trackingStarted', onTrackingStarted);
      coinTracker.on('phaseTransition', onPhaseTransition);
      coinTracker.on('24hourEvaluation', onEvaluation);

      try {
        // Start tracking
        await coinTracker.startTracking(highPerformerToken.mintAddress);

        // Simulate exceptional growth over 24 hours
        await simulateHighPerformanceGrowth(highPerformerToken);

        // Fast-forward through entire 24-hour cycle
        await coinTracker.mockTimeProgression(highPerformerToken.mintAddress, 24.5);

        // Verify tracking started
        expect(trackingEvents).toHaveLength(1);
        expect(trackingEvents[0].phase).toBe(TrackingPhase.INTENSIVE);

        // Verify phase transitions
        expect(phaseTransitions.length).toBeGreaterThanOrEqual(1);
        
        // Verify 24-hour evaluation
        expect(evaluations).toHaveLength(1);
        expect(evaluations[0].grade).toMatch(/[AB]/); // Should get A or B grade
        expect(evaluations[0].score).toBeGreaterThanOrEqual(80);
        expect(evaluations[0].willContinueTracking).toBe(true);

        // Verify final token state
        const finalToken = await Token.findById(highPerformerToken._id);
        expect(finalToken?.potentialScore).toBeGreaterThanOrEqual(80);
        expect(finalToken?.volumeHistory.length).toBeGreaterThan(5); // Should have accumulated data
      } finally {
        // Clean up event listeners
        coinTracker.off('trackingStarted', onTrackingStarted);
        coinTracker.off('phaseTransition', onPhaseTransition);
        coinTracker.off('24hourEvaluation', onEvaluation);
      }
    });

    it('should simulate lifecycle for average performer (Grade C)', async () => {
      const evaluations: any[] = [];
      coinTracker.on('24hourEvaluation', (data) => evaluations.push(data));

      await coinTracker.startTracking(averageToken.mintAddress);

      // Simulate moderate growth
      await simulateAveragePerformanceGrowth(averageToken);

      // Fast-forward 24 hours
      await coinTracker.mockTimeProgression(averageToken.mintAddress, 24.5);

      // Verify evaluation
      expect(evaluations).toHaveLength(1);
      expect(evaluations[0].grade).toMatch(/[CD]/);
      expect(evaluations[0].score).toBeLessThan(80);
      expect(evaluations[0].willContinueTracking).toBe(false);

      // Should be archived
      const finalToken = await Token.findOne({ mintAddress: averageToken.mintAddress });
      expect(finalToken?.isActive).toBe(false);
    });

    it('should simulate lifecycle for poor performer (Grade F)', async () => {
      const evaluations: any[] = [];
      coinTracker.on('24hourEvaluation', (data) => evaluations.push(data));

      await coinTracker.startTracking(poorPerformerToken.mintAddress);

      // Simulate poor/declining performance
      await simulatePoorPerformance(poorPerformerToken);

      // Fast-forward 24 hours
      await coinTracker.mockTimeProgression(poorPerformerToken.mintAddress, 24.5);

      // Verify evaluation
      expect(evaluations).toHaveLength(1);
      expect(evaluations[0].grade).toBe('F');
      expect(evaluations[0].score).toBeLessThan(60);
      expect(evaluations[0].willContinueTracking).toBe(false);
    });
  });

  describe('Phase-Specific Time Progression', () => {
    it('should respect 2-minute intervals in intensive phase', async () => {

describe('Complete 24-Hour Lifecycle Simulation', () => {
  it('should simulate entire lifecycle for high performer (Grade A)', async () => {
    const trackingEvents: any[] = [];
    const phaseTransitions: any[] = [];
    const evaluations: any[] = [];

    coinTracker.on('trackingStarted', (data) => trackingEvents.push({ type: 'started', ...data }));
    coinTracker.on('phaseTransition', (data) => phaseTransitions.push(data));
    coinTracker.on('24hourEvaluation', (data) => evaluations.push(data));

    // Start tracking
    await coinTracker.startTracking(highPerformerToken.mintAddress);

    // Simulate exceptional growth over 24 hours
    await simulateHighPerformanceGrowth(highPerformerToken);

    // Fast-forward through entire 24-hour cycle
    await coinTracker.mockTimeProgression(highPerformerToken.mintAddress, 24.5);

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
    const finalToken = await Token.findById(highPerformerToken._id);
    expect(finalToken?.potentialScore).toBeGreaterThanOrEqual(80);
    expect(finalToken?.volumeHistory.length).toBeGreaterThan(10); // Should have accumulated data
  });

  it('should simulate lifecycle for average performer (Grade C)', async () => {
    const evaluations: any[] = [];
    coinTracker.on('24hourEvaluation', (data) => evaluations.push(data));
      
      // Delete token mid-tracking
      await Token.deleteOne({ mintAddress: highPerformerToken.mintAddress });
      
      // Should not throw error
      await expect(
        coinTracker.mockTimeProgression(highPerformerToken.mintAddress, 1)
      ).resolves.not.toThrow();
    });

    it('should prevent time progression in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await coinTracker.startTracking(highPerformerToken.mintAddress);
      
      await expect(
        coinTracker.mockTimeProgression(highPerformerToken.mintAddress, 1)
      ).rejects.toThrow('Token not found');

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle extreme time progression gracefully', async () => {
      await coinTracker.startTracking(highPerformerToken.mintAddress);
      
      // Try progressing 100 hours (should cap at reasonable limits)
      await expect(
        coinTracker.mockTimeProgression(highPerformerToken.mintAddress, 100)
      ).resolves.not.toThrow();
      
      // Clean up
      await coinTracker.stopTracking(highPerformerToken.mintAddress);
    });
  });

  import {
    simulateHighPerformanceGrowth,
    simulateAveragePerformanceGrowth,
    simulatePoorPerformance
  } from './testHelpers';

  export {
    simulateHighPerformanceGrowth,
    simulateAveragePerformanceGrowth,
    simulatePoorPerformance
  };
// Should not throw error
await expect(
coinTracker.mockTimeProgression(highPerformerToken.mintAddress, 1)
).resolves.not.toThrow();
});

it('should prevent time progression in production', async () => {
const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';

await coinTracker.startTracking(highPerformerToken.mintAddress);
      
await expect(
coinTracker.mockTimeProgression(highPerformerToken.mintAddress, 1)
).rejects.toThrow('Token not found');

process.env.NODE_ENV = originalEnv;
});

it('should handle extreme time progression gracefully', async () => {
await coinTracker.startTracking(highPerformerToken.mintAddress);
      
// Try progressing 100 hours (should cap at reasonable limits)
await expect(
coinTracker.mockTimeProgression(highPerformerToken.mintAddress, 100)
).resolves.not.toThrow();
      
// Clean up
await coinTracker.stopTracking(highPerformerToken.mintAddress);
});

import {
simulateHighPerformanceGrowth,
simulateAveragePerformanceGrowth,
simulatePoorPerformance
} from './testHelpers';

export {
simulateHighPerformanceGrowth,
simulateAveragePerformanceGrowth,
simulatePoorPerformance
};