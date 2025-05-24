import { connectDB, mongoose } from '../config/mongodb';
import Token from '../models/token';
import logger from '../utils/logger';

const runTest = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await connectDB();

    // Wait for connection to be fully established
    if (mongoose.connection.readyState !== 1) {
      throw new Error(`MongoDB connection not ready. State: ${mongoose.connection.readyState}`);
    }

    // Clean up existing collection and indexes
    logger.info('Cleaning up existing collection and indexes...');
    await mongoose.connection.dropCollection('tokens').catch(() => {
      logger.info('Collection does not exist, skipping drop');
    });

    logger.info('Getting Token model...');
    logger.debug('Token model details:', {
      modelName: Token.modelName,
      collectionName: Token.collection.name,
      schema: Object.keys(Token.schema.paths)
    });

    // Test 1: Create a new token
    const testToken = {
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
      isActive: true
    };

    logger.info('Test 1: Creating test token...');
    logger.debug('Test token data:', testToken);
    const createdToken = await Token.create(testToken);
    logger.info('Test token created:', createdToken._id);
    logger.debug('Created token details:', createdToken.toObject());

    // Test 2: Update time series data
    logger.info('Test 2: Updating time series data...');
    const updatedToken = await createdToken.updateTimeSeriesData('volume', 2000);
    logger.info('Token updated with new volume:', updatedToken.metrics.currentVolume);
    logger.debug('Updated token details:', updatedToken.toObject());

    // Test 3: Add pattern
    logger.info('Test 3: Adding pattern...');
    const pattern = {
      type: 'bullish',
      confidence: 0.8,
      timestamp: new Date()
    };
    const tokenWithPattern = await updatedToken.addPattern(pattern);
    logger.info('Pattern added to token');
    logger.debug('Token with pattern:', tokenWithPattern.toObject());

    // Test 4: Graduate token
    logger.info('Test 4: Graduating token...');
    const graduatedToken = await tokenWithPattern.graduate();
    logger.info('Token graduated:', graduatedToken.isGraduated);
    logger.debug('Graduated token details:', graduatedToken.toObject());

    // Test 5: Find near graduation tokens
    logger.info('Test 5: Finding near graduation tokens...');
    const nearGraduationTokens = await Token.findNearGraduation();
    logger.info('Found near graduation tokens:', nearGraduationTokens.length);
    logger.debug('Near graduation tokens:', nearGraduationTokens.map(t => ({
      mintAddress: t.mintAddress,
      volume24h: t.metrics.volume24h,
      currentVolume: t.metrics.currentVolume
    })));

    // Test 6: Find top potential tokens
    logger.info('Test 6: Finding top potential tokens...');
    const topPotentialTokens = await Token.findTopPotential(5);
    logger.info('Found top potential tokens:', topPotentialTokens.length);
    logger.debug('Top potential tokens:', topPotentialTokens.map(t => ({
      mintAddress: t.mintAddress,
      potentialScore: t.potentialScore
    })));

  } catch (error) {
    logger.error('Test failed:', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : String(error)
    });
  } finally {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
};

runTest(); 