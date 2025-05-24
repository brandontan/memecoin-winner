import { connectDB, mongoose } from '../config/mongodb';
import Token from '../models/token';
import logger from '../utils/logger';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ConnectOptions } from 'mongoose';
const { ConnectionStates } = mongoose;

describe('MongoDB Connection Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await connectDB();
    if (mongoose.connection.readyState === 1) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }
    }
  });

  describe('Connection Tests', () => {
    test('should connect to MongoDB successfully', async () => {
      expect(mongoose.connection.readyState).toBe(1);
      logger.info('MongoDB connection test passed');
    });

    test('should handle connection errors gracefully', async () => {
      jest.setTimeout(2000);
      const originalUri = process.env.MONGODB_URI;
      process.env.MONGODB_URI = 'mongodb://invalid:27017/test';
      try {
        await mongoose.disconnect();
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 1000 } as ConnectOptions);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        logger.info('MongoDB error handling test passed');
      } finally {
        process.env.MONGODB_URI = originalUri;
        await connectDB();
      }
    }, 2000);

    // Helper to wait for a specific connection state
    function waitForState(state: number, timeout = 10000): Promise<void> {
      return new Promise((resolve, reject) => {
        if (mongoose.connection.readyState === state) return resolve();
        const event = state === 1 ? 'connected' : 'disconnected';
        const timer = setTimeout(() => {
          mongoose.connection.removeListener(event, handler);
          reject(new Error('Timeout waiting for connection state: ' + state));
        }, timeout);
        function handler() {
          clearTimeout(timer);
          mongoose.connection.removeListener(event, handler);
          resolve();
        }
        mongoose.connection.on(event, handler);
      });
    }

    test('should reconnect after disconnection', async () => {
      expect(mongoose.connection.readyState).toBe(1);
      await mongoose.disconnect();
      await waitForState(0, 10000);
      expect(mongoose.connection.readyState).toBe(0);
      await connectDB();
      await waitForState(1, 10000);
      expect(mongoose.connection.readyState).toBe(1);
      logger.info('MongoDB reconnection test passed');
    }, 20000);
  });

  describe('CRUD Operations Tests', () => {
    test('should create and read a token', async () => {
      const tokenData = {
        mintAddress: 'test_mint_' + Date.now(),
        name: 'Test Token',
        symbol: 'TEST',
        createdAt: new Date(),
        creator: 'test_creator',
        currentVolume: 1000,
        currentPrice: 1.0,
        holderCount: 100,
        liquidityAmount: 5000,
        volumeHistory: [{ timestamp: new Date(), value: 1000 }],
        priceHistory: [{ timestamp: new Date(), value: 1.0 }],
        holderHistory: [{ timestamp: new Date(), value: 100 }],
        potentialScore: 75,
        volumeGrowthRate: 0.1,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      };
      const token = await Token.create(tokenData);
      expect(token.mintAddress).toBe(tokenData.mintAddress);
      const foundToken = await Token.findOne({ mintAddress: tokenData.mintAddress });
      expect(foundToken).toBeDefined();
      expect(foundToken?.name).toBe(tokenData.name);
      logger.info('MongoDB create/read test passed');
    });

    test('should update a token', async () => {
      const token = await Token.create({
        mintAddress: 'test_mint_' + Date.now(),
        name: 'Test Token',
        symbol: 'TEST',
        createdAt: new Date(),
        creator: 'test_creator',
        currentVolume: 1000,
        currentPrice: 1.0,
        holderCount: 100,
        liquidityAmount: 5000,
        volumeHistory: [{ timestamp: new Date(), value: 1000 }],
        priceHistory: [{ timestamp: new Date(), value: 1.0 }],
        holderHistory: [{ timestamp: new Date(), value: 100 }],
        potentialScore: 75,
        volumeGrowthRate: 0.1,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      const newVolume = 2000;
      await token.updateTimeSeriesData('volume', newVolume);
      const updatedToken = await Token.findOne({ mintAddress: token.mintAddress });
      expect(updatedToken?.currentVolume).toBe(newVolume);
      expect(updatedToken?.volumeHistory).toHaveLength(2);
      logger.info('MongoDB update test passed');
    });

    test('should delete a token', async () => {
      const token = await Token.create({
        mintAddress: 'test_mint_' + Date.now(),
        name: 'Test Token',
        symbol: 'TEST',
        createdAt: new Date(),
        creator: 'test_creator',
        currentVolume: 1000,
        currentPrice: 1.0,
        holderCount: 100,
        liquidityAmount: 5000,
        volumeHistory: [{ timestamp: new Date(), value: 1000 }],
        priceHistory: [{ timestamp: new Date(), value: 1.0 }],
        holderHistory: [{ timestamp: new Date(), value: 100 }],
        potentialScore: 75,
        volumeGrowthRate: 0.1,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      await Token.deleteOne({ mintAddress: token.mintAddress });
      const deletedToken = await Token.findOne({ mintAddress: token.mintAddress });
      expect(deletedToken).toBeNull();
      logger.info('MongoDB delete test passed');
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle duplicate key errors', async () => {
      const mintAddress = 'test_mint_' + Date.now();
      await Token.create({
        mintAddress,
        name: 'Test Token 1',
        symbol: 'TEST1',
        createdAt: new Date(),
        creator: 'test_creator',
        currentVolume: 1000,
        currentPrice: 1.0,
        holderCount: 100,
        liquidityAmount: 5000,
        volumeHistory: [{ timestamp: new Date(), value: 1000 }],
        priceHistory: [{ timestamp: new Date(), value: 1.0 }],
        holderHistory: [{ timestamp: new Date(), value: 100 }],
        potentialScore: 75,
        volumeGrowthRate: 0.1,
        isGraduated: false,
        isActive: true,
        lastUpdated: new Date(),
        detectedPatterns: []
      });
      try {
        await Token.create({
          mintAddress,
          name: 'Test Token 2',
          symbol: 'TEST2',
          createdAt: new Date(),
          creator: 'test_creator',
          currentVolume: 2000,
          currentPrice: 2.0,
          holderCount: 200,
          liquidityAmount: 10000,
          volumeHistory: [{ timestamp: new Date(), value: 2000 }],
          priceHistory: [{ timestamp: new Date(), value: 2.0 }],
          holderHistory: [{ timestamp: new Date(), value: 200 }],
          potentialScore: 80,
          volumeGrowthRate: 0.2,
          isGraduated: false,
          isActive: true,
          lastUpdated: new Date(),
          detectedPatterns: []
        });
        fail('Should have thrown a duplicate key error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as any).code).toBe(11000);
        logger.info('MongoDB duplicate key error handling test passed');
      }
    });

    test('should handle validation errors', async () => {
      // Create a valid token first
      const validToken = {
        mintAddress: 'test_mint_' + Date.now(),
        name: 'Test Token',
        symbol: 'TEST',
        creator: 'test_creator',
        currentPrice: 0.1,
        currentVolume: 1000,
        holderCount: 10,
        liquidityAmount: 10000
      };

      // This should pass validation
      const token = await Token.create(validToken);
      expect(token).toBeDefined();
      
      // Try to create an invalid token (missing required fields)
      try {
        await Token.create({
          // Missing required fields
          mintAddress: 'test_mint_invalid_' + Date.now()
        });
        fail('Should have thrown a validation error');
      } catch (error: any) {
        expect(error).toBeDefined();
        // Check if it's a validation error
        if (error.name === 'ValidationError') {
          logger.info('MongoDB validation error handling test passed');
          return;
        }
        // If we get here, it's not the error we expected
        throw error;
      }
    });
  });
}); 