import mongoose from 'mongoose';
import Token, { ITokenDocument } from '../models/token';
import { MongoMemoryServer } from 'mongodb-memory-server';

describe('Token Model', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await mongoose.connect(process.env.MONGODB_URI);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  // --- Basic CRUD Operations ---
  describe('CRUD Operations', () => {
    it('should create a new token with all required fields', async () => {
      const tokenData = {
        mintAddress: 'mint1',
        name: 'Test Token',
        symbol: 'TEST',
        createdAt: new Date(),
        creator: 'creator1',
        currentVolume: 1000,
        currentPrice: 1.5,
        holderCount: 10,
        liquidityAmount: 500,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 50,
        volumeGrowthRate: 0.2,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      };
      const token = await Token.create(tokenData);
      expect(token.mintAddress).toBe('mint1');
      expect(token.name).toBe('Test Token');
      expect(token.symbol).toBe('TEST');
      expect(token.isGraduated).toBe(false);
      expect(token.isActive).toBe(true);
    });

    it('should retrieve tokens by mint address', async () => {
      await Token.create({
        mintAddress: 'mint2',
        name: 'Token2',
        symbol: 'TK2',
        createdAt: new Date(),
        creator: 'creator2',
        currentVolume: 2000,
        currentPrice: 2.5,
        holderCount: 20,
        liquidityAmount: 1000,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 60,
        volumeGrowthRate: 0.3,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      const found = await Token.findOne({ mintAddress: 'mint2' });
      expect(found).toBeDefined();
      expect(found?.name).toBe('Token2');
    });

    it('should update token information', async () => {
      const token = await Token.create({
        mintAddress: 'mint3',
        name: 'Token3',
        symbol: 'TK3',
        createdAt: new Date(),
        creator: 'creator3',
        currentVolume: 3000,
        currentPrice: 3.5,
        holderCount: 30,
        liquidityAmount: 1500,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 70,
        volumeGrowthRate: 0.4,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      token.currentPrice = 4.0;
      await token.save();
      const updated = await Token.findOne({ mintAddress: 'mint3' });
      expect(updated?.currentPrice).toBe(4.0);
    });

    it('should delete a token', async () => {
      await Token.create({
        mintAddress: 'mint4',
        name: 'Token4',
        symbol: 'TK4',
        createdAt: new Date(),
        creator: 'creator4',
        currentVolume: 4000,
        currentPrice: 4.5,
        holderCount: 40,
        liquidityAmount: 2000,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 80,
        volumeGrowthRate: 0.5,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      await Token.deleteOne({ mintAddress: 'mint4' });
      const deleted = await Token.findOne({ mintAddress: 'mint4' });
      expect(deleted).toBeNull();
    });
  });

  // --- Token Lifecycle ---
  describe('Token Lifecycle', () => {
    it("should track a token's progress (volume updates)", async () => {
      const token = await Token.create({
        mintAddress: 'mint5',
        name: 'Token5',
        symbol: 'TK5',
        createdAt: new Date(),
        creator: 'creator5',
        currentVolume: 1000,
        currentPrice: 1.0,
        holderCount: 10,
        liquidityAmount: 100,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 10,
        volumeGrowthRate: 0.1,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      await token.updateTimeSeriesData('volume', 2000);
      await token.updateTimeSeriesData('volume', 3000);
      const updated = await Token.findOne({ mintAddress: 'mint5' });
      expect(updated?.currentVolume).toBe(3000);
      expect(updated?.volumeHistory.length).toBe(2);
    });

    it('should graduate a token at 69K SOL', async () => {
      const token = await Token.create({
        mintAddress: 'mint6',
        name: 'Token6',
        symbol: 'TK6',
        createdAt: new Date(),
        creator: 'creator6',
        currentVolume: 68000,
        currentPrice: 1.0,
        holderCount: 10,
        liquidityAmount: 100,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 10,
        volumeGrowthRate: 0.1,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      await token.updateTimeSeriesData('volume', 69000);
      await token.graduate();
      const graduated = await Token.findOne({ mintAddress: 'mint6' });
      expect(graduated?.isGraduated).toBe(true);
      expect(graduated?.graduatedAt).toBeDefined();
    });

    it('should reflect different lifecycle stages', async () => {
      const token = await Token.create({
        mintAddress: 'mint7',
        name: 'Token7',
        symbol: 'TK7',
        createdAt: new Date(),
        creator: 'creator7',
        currentVolume: 0,
        currentPrice: 0,
        holderCount: 0,
        liquidityAmount: 0,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 0,
        volumeGrowthRate: 0,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      await token.updateTimeSeriesData('volume', 1000);
      await token.updateTimeSeriesData('volume', 69000);
      await token.graduate();
      const graduated = await Token.findOne({ mintAddress: 'mint7' });
      expect(graduated?.isGraduated).toBe(true);
      expect(graduated?.currentVolume).toBe(69000);
    });
  });

  // --- Time-Series Data ---
  describe('Time-Series Data', () => {
    it('should add volume data points', async () => {
      const token = await Token.create({
        mintAddress: 'mint8',
        name: 'Token8',
        symbol: 'TK8',
        createdAt: new Date(),
        creator: 'creator8',
        currentVolume: 0,
        currentPrice: 0,
        holderCount: 0,
        liquidityAmount: 0,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 0,
        volumeGrowthRate: 0,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      await token.updateTimeSeriesData('volume', 100);
      await token.updateTimeSeriesData('volume', 200);
      const updated = await Token.findOne({ mintAddress: 'mint8' });
      expect(updated?.volumeHistory.length).toBe(2);
      expect(updated?.volumeHistory[1].volume).toBe(200);
    });

    it('should add price data points', async () => {
      const token = await Token.create({
        mintAddress: 'mint9',
        name: 'Token9',
        symbol: 'TK9',
        createdAt: new Date(),
        creator: 'creator9',
        currentVolume: 0,
        currentPrice: 0,
        holderCount: 0,
        liquidityAmount: 0,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 0,
        volumeGrowthRate: 0,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      await token.updateTimeSeriesData('price', 1.23);
      await token.updateTimeSeriesData('price', 2.34);
      const updated = await Token.findOne({ mintAddress: 'mint9' });
      expect(updated?.priceHistory.length).toBe(2);
      expect(updated?.priceHistory[1].price).toBe(2.34);
    });

    it('should add holder count data points', async () => {
      const token = await Token.create({
        mintAddress: 'mint10',
        name: 'Token10',
        symbol: 'TK10',
        createdAt: new Date(),
        creator: 'creator10',
        currentVolume: 0,
        currentPrice: 0,
        holderCount: 0,
        liquidityAmount: 0,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 0,
        volumeGrowthRate: 0,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      await Token.findOneAndUpdate(
        { mintAddress: 'mint10' },
        { $push: { holderHistory: { timestamp: new Date(), count: 5 } } }
      );
      await Token.findOneAndUpdate(
        { mintAddress: 'mint10' },
        { $push: { holderHistory: { timestamp: new Date(), count: 10 } } }
      );
      const updated = await Token.findOne({ mintAddress: 'mint10' });
      // Debug logging
      console.log('Updated token:', JSON.stringify(updated, null, 2));
      console.log('Holder history:', JSON.stringify(updated?.holderHistory, null, 2));
      console.log('Holder history length:', updated?.holderHistory?.length);
      console.log('Second item:', updated?.holderHistory?.[1]);
      
      expect(updated?.holderHistory.length).toBe(2);
      expect(updated?.holderHistory[1].count).toBe(10);
    });
  });

  // --- Static Methods ---
  describe('Static Methods', () => {
    it('should find tokens near graduation', async () => {
      await Token.create({
        mintAddress: 'mint11',
        name: 'Token11',
        symbol: 'TK11',
        createdAt: new Date(),
        creator: 'creator11',
        currentVolume: 50000,
        currentPrice: 1.0,
        potentialScore: 85,
        volumeGrowthRate: 0.1,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      const nearGrad = await Token.findNearGraduation();
      expect(nearGrad.length).toBeGreaterThan(0);
      expect(nearGrad[0].potentialScore).toBeGreaterThanOrEqual(80);
      expect(nearGrad[0].isGraduated).toBe(false);
    });

    it('should find tokens with high potential scores', async () => {
      await Token.create({
        mintAddress: 'mint12',
        name: 'Token12',
        symbol: 'TK12',
        createdAt: new Date(),
        creator: 'creator12',
        currentVolume: 1000,
        currentPrice: 1.0,
        holderCount: 10,
        liquidityAmount: 100,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 99,
        volumeGrowthRate: 0.1,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      const top = await Token.findTopPotential(1);
      expect(top.length).toBe(1);
      expect(top[0].potentialScore).toBe(99);
    });

    it('should find recently created tokens', async () => {
      const now = new Date();
      await Token.create({
        mintAddress: 'mint13',
        name: 'Token13',
        symbol: 'TK13',
        createdAt: now,
        creator: 'creator13',
        currentVolume: 1000,
        currentPrice: 1.0,
        holderCount: 10,
        liquidityAmount: 100,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 10,
        volumeGrowthRate: 0.1,
        isGraduated: false,
        isActive: true,
        lastUpdated: now,
        detectedPatterns: []
      });
      const recent = await Token.find({ createdAt: { $gte: new Date(now.getTime() - 1000 * 60 * 5) } });
      expect(recent.length).toBeGreaterThan(0);
      expect(recent[0].mintAddress).toBe('mint13');
    });
  });

  // --- Schema Validation ---
  describe('Schema Validation', () => {
    it('should enforce required fields', async () => {
      try {
        await Token.create({ name: 'No Mint', symbol: 'NM' });
        fail('Should have thrown validation error');
      } catch (err: any) {
        expect(err).toBeDefined();
        expect(err.name).toBe('ValidationError');
      }
    });

    it('should enforce data types', async () => {
      try {
        await Token.create({
          mintAddress: 'mint14',
          name: 'Bad Type',
          symbol: 'BT',
          createdAt: new Date(),
          creator: 'creator14',
          currentVolume: 'not-a-number', // invalid
          currentPrice: 1.0,
          holderCount: 10,
          liquidityAmount: 100,
          volumeHistory: [],
          priceHistory: [],
          holderHistory: [],
          potentialScore: 10,
          volumeGrowthRate: 0.1,
          isGraduated: false,
          isActive: true,
          lastUpdated: new Date(),
          detectedPatterns: []
        });
        fail('Should have thrown validation error');
      } catch (err: any) {
        expect(err).toBeDefined();
        expect(err.name).toBe('ValidationError');
      }
    });

    it('should set default values correctly', async () => {
      const token = await Token.create({
        mintAddress: 'mint15',
        name: 'Default Token',
        symbol: 'DT',
        createdAt: new Date(),
        creator: 'creator15',
        currentVolume: 0,
        currentPrice: 0,
        holderCount: 0,
        liquidityAmount: 0,
        volumeHistory: [],
        priceHistory: [],
        holderHistory: [],
        potentialScore: 0,
        volumeGrowthRate: 0
      });
      expect(token.isGraduated).toBe(false);
      expect(token.isActive).toBe(true);
      expect(token.lastUpdated).toBeDefined();
    });
  });
}); 