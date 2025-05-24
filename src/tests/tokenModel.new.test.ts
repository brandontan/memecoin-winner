import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Token, { TokenStatus, IToken } from '../models/token';

// Mock logger to prevent console output during tests
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('Token Model (New Schema)', () => {
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
    await Token.deleteMany({});
  });

  describe('Token Creation', () => {
    it('should create a new token with required fields', async () => {
      const tokenData = {
        address: 'TOKEN1234567890123456789012345678901234567890',
        name: 'Test Token',
        symbol: 'TEST',
        creator: 'CREATOR12345678901234567890123456789012345678',
        status: TokenStatus.NEW,
        score: 0,
        confidence: 0,
        signals: [],
        metrics: {
          priceUSD: 0.01,
          volume24h: 1000,
          holders: 10,
          liquiditySOL: 5,
          marketCap: 10000,
          priceChange1h: 0.5,
          priceChange24h: 1.2
        },
        history: [{
          timestamp: new Date(),
          price: 0.01,
          volume: 1000,
          holders: 10,
          liquidity: 5
        }],
        categories: ['meme'],
        isActive: true
      };

      const token = await Token.create(tokenData);
      
      expect(token).toBeDefined();
      expect(token.address).toBe(tokenData.address);
      expect(token.status).toBe(TokenStatus.NEW);
      expect(token.score).toBe(0);
      expect(token.metrics.priceUSD).toBe(0.01);
    });

    it('should require all required fields', async () => {
      const tokenData = {
        // Missing required fields
        name: 'Incomplete Token'
      };

      let error;
      try {
        await Token.create(tokenData);
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeInstanceOf(mongoose.Error.ValidationError);
    });
  });

  describe('Token Methods', () => {
    let token: IToken;

    beforeEach(async () => {
      token = await Token.create({
        address: 'TOKEN1234567890123456789012345678901234567890',
        name: 'Test Token',
        symbol: 'TEST',
        creator: 'CREATOR12345678901234567890123456789012345678',
        status: TokenStatus.NEW,
        score: 0,
        confidence: 0,
        signals: [],
        metrics: {
          priceUSD: 0.01,
          volume24h: 1000,
          holders: 10,
          liquiditySOL: 5,
          marketCap: 10000,
          priceChange1h: 0.5,
          priceChange24h: 1.2
        },
        history: [{
          timestamp: new Date(),
          price: 0.01,
          volume: 1000,
          holders: 10,
          liquidity: 5
        }],
        categories: ['meme'],
        isActive: true
      });
    });

    it('should update metrics and history', async () => {
      const newMetrics = {
        priceUSD: 0.02,
        volume24h: 2000,
        holders: 20,
        liquiditySOL: 10,
        marketCap: 20000,
        priceChange1h: 1.0,
        priceChange24h: 2.0
      };

      const updatedToken = await token.updateMetrics(newMetrics);
      
      // Check if metrics were updated
      expect(updatedToken.metrics.priceUSD).toBe(0.02);
      expect(updatedToken.metrics.volume24h).toBe(2000);
      
      // Check if history was added
      expect(updatedToken.history.length).toBeGreaterThan(0);
      const latestHistory = updatedToken.history[updatedToken.history.length - 1];
      expect(latestHistory.price).toBe(0.02);
      expect(latestHistory.volume).toBe(2000);
    });

    it('should update score and status', async () => {
      // Test STRONG status
      let updatedToken = await token.updateScore(75, 0.9);
      expect(updatedToken.score).toBe(75);
      expect(updatedToken.confidence).toBe(0.9);
      expect(updatedToken.status).toBe(TokenStatus.STRONG);
      
      // Test WATCH status
      updatedToken = await token.updateScore(60, 0.8);
      expect(updatedToken.status).toBe(TokenStatus.WATCH);
      
      // Test NEW status
      updatedToken = await token.updateScore(30, 0.7);
      expect(updatedToken.status).toBe(TokenStatus.NEW);
    });

    it('should graduate token', async () => {
      const graduatedToken = await token.graduate();
      
      expect(graduatedToken.status).toBe(TokenStatus.GRADUATED);
      expect(graduatedToken.graduatedAt).toBeDefined();
      expect(graduatedToken.graduatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      // Create test tokens with complete data
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      await Token.create([
        {
          address: 'TOKEN1',
          name: 'High Potential',
          symbol: 'HIGH',
          creator: 'CREATOR1',
          status: TokenStatus.STRONG,
          score: 90,
          confidence: 0.95,
          signals: ['high_volume', 'growing_community'],
          metrics: { 
            priceUSD: 0.1, 
            volume24h: 50000, 
            holders: 100, 
            liquiditySOL: 100,
            marketCap: 1000000,
            priceChange1h: 5.0,
            priceChange24h: 10.0
          },
          history: [{
            timestamp: oneHourAgo,
            price: 0.02,
            volume: 10000,
            holders: 50,
            liquidity: 50
          }],
          categories: ['meme', 'trending'],
          isActive: true,
          createdAt: oneHourAgo,
          updatedAt: now
        },
        {
          address: 'TOKEN2',
          name: 'Watch List',
          symbol: 'WATCH',
          creator: 'CREATOR2',
          status: TokenStatus.WATCH,
          score: 60,
          confidence: 0.8,
          signals: ['moderate_volume'],
          metrics: { 
            priceUSD: 0.05, 
            volume24h: 10000, 
            holders: 50, 
            liquiditySOL: 50,
            marketCap: 200000,
            priceChange1h: 1.0,
            priceChange24h: 2.0
          },
          history: [{
            timestamp: oneHourAgo,
            price: 0.025,
            volume: 5000,
            holders: 25,
            liquidity: 25
          }],
          categories: ['meme'],
          isActive: true,
          createdAt: oneHourAgo,
          updatedAt: now
        },
        {
          address: 'TOKEN3',
          name: 'New Token',
          symbol: 'NEW',
          creator: 'CREATOR3',
          status: TokenStatus.NEW,
          score: 30,
          confidence: 0.5,
          signals: [],
          metrics: { 
            priceUSD: 0.01, 
            volume24h: 1000, 
            holders: 10, 
            liquiditySOL: 10,
            marketCap: 10000,
            priceChange1h: 0.1,
            priceChange24h: 0.1
          },
          history: [{
            timestamp: oneHourAgo,
            price: 0.009,
            volume: 500,
            holders: 5,
            liquidity: 5
          }],
          categories: ['new'],
          isActive: true,
          createdAt: oneHourAgo,
          updatedAt: now
        },
        {
          address: 'TOKEN4',
          name: 'Graduated Token',
          symbol: 'GRAD',
          creator: 'CREATOR1',
          status: TokenStatus.GRADUATED,
          score: 95,
          confidence: 0.99,
          signals: ['high_volume', 'strong_community', 'high_liquidity'],
          metrics: { 
            priceUSD: 1.0, 
            volume24h: 100000, 
            holders: 1000, 
            liquiditySOL: 1000,
            marketCap: 10000000,
            priceChange1h: 0.5,
            priceChange24h: 5.0
          },
          history: [{
            timestamp: oneHourAgo,
            price: 0.95,
            volume: 95000,
            holders: 950,
            liquidity: 950
          }],
          categories: ['bluechip', 'meme'],
          isActive: true,
          graduatedAt: now,
          createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          updatedAt: now
        }
      ]);
    });

    it('should find tokens by status', async () => {
      const strongTokens = await Token.findByStatus(TokenStatus.STRONG);
      expect(strongTokens).toHaveLength(1);
      expect(strongTokens[0].symbol).toBe('HIGH');
      expect(strongTokens[0].metrics.volume24h).toBe(50000);
      
      const watchTokens = await Token.findByStatus(TokenStatus.WATCH);
      expect(watchTokens).toHaveLength(1);
      expect(watchTokens[0].symbol).toBe('WATCH');
      
      const graduatedTokens = await Token.findByStatus(TokenStatus.GRADUATED);
      expect(graduatedTokens).toHaveLength(1);
      expect(graduatedTokens[0].symbol).toBe('GRAD');
    });

    it('should find high potential tokens', async () => {
      // Find tokens with score >= 70
      let highPotential = await Token.findHighPotential(2, 70);
      expect(highPotential).toHaveLength(1);
      expect(highPotential[0].symbol).toBe('HIGH');
      
      // Test with lower threshold
      highPotential = await Token.findHighPotential(10, 50);
      expect(highPotential.length).toBeGreaterThanOrEqual(2);
      expect(highPotential.map(t => t.symbol)).toContain('HIGH');
      expect(highPotential.map(t => t.symbol)).toContain('WATCH');
    });

    it('should find trending tokens', async () => {
      const trending = await Token.findTrending(2);
      expect(trending).toHaveLength(2);
      // Should be ordered by volume24h descending
      expect(trending[0].symbol).toBe('GRAD');
      expect(trending[0].metrics.volume24h).toBe(100000);
      expect(trending[1].symbol).toBe('HIGH');
      expect(trending[1].metrics.volume24h).toBe(50000);
    });

    it('should find tokens by creator', async () => {
      const creatorTokens = await Token.findByCreator('CREATOR1');
      expect(creatorTokens).toHaveLength(2);
      expect(creatorTokens.some(t => t.symbol === 'HIGH')).toBe(true);
      expect(creatorTokens.some(t => t.symbol === 'GRAD')).toBe(true);
      
      // Test with non-existent creator
      const emptyTokens = await Token.findByCreator('NON_EXISTENT');
      expect(emptyTokens).toHaveLength(0);
    });

    it('should search tokens by name or symbol', async () => {
      // Search by symbol (case insensitive)
      let results = await Token.search('high');
      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('HIGH');
      
      // Search by name (partial match)
      results = await Token.search('Potential');
      expect(results[0].symbol).toBe('HIGH');
      
      // Search with no matches
      results = await Token.search('nonexistent');
      expect(results).toHaveLength(0);
    });
  });
});
