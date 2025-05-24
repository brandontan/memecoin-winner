const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const Token = require('../models/token');
const logger = require('../utils/logger');

// Real Solana token addresses for testing
const TEST_TOKENS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
  'So11111111111111111111111111111111111111112',  // Wrapped SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'   // USDC
];

describe('Test 1: MongoDB Connection Test', () => {
  let mongoServer;
  let mongoUri;

  beforeAll(async () => {
    // Start in-memory MongoDB instance
    mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
    
    // Connect to the in-memory database
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    logger.info('Connected to in-memory MongoDB for testing');
  });

  afterAll(async () => {
    // Clean up: disconnect and stop the in-memory database
    await mongoose.disconnect();
    await mongoServer.stop();
    logger.info('Disconnected from test database');
  });

  beforeEach(async () => {
    // Clear all tokens before each test
    await Token.deleteMany({});
  });

  test('should connect to MongoDB successfully', async () => {
    // Verify we have an active connection
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected
    expect(mongoose.connection.db).toBeDefined();
    
    // Verify we can ping the database
    const adminDb = mongoose.connection.db.admin();
    const result = await adminDb.ping();
    expect(result.ok).toBe(1);
  });

  test('should save a simple token record', async () => {
    // Create a basic token record with real Solana address
    const tokenData = {
      address: TEST_TOKENS[0], // TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
      name: 'Test Token',
      symbol: 'TEST',
      creator: 'So11111111111111111111111111111111111111112', // Real creator address
      launchTime: new Date(),
      volume: 1000,
      buyers: 5,
      priceUSD: 0.01
    };

    // Save the token
    const token = new Token(tokenData);
    const savedToken = await token.save();

    // Verify it was saved correctly
    expect(savedToken._id).toBeDefined();
    expect(savedToken.address).toBe(TEST_TOKENS[0]);
    expect(savedToken.name).toBe('Test Token');
    expect(savedToken.symbol).toBe('TEST');
    expect(savedToken.creator).toBe('So11111111111111111111111111111111111111112');
    expect(savedToken.volume).toBe(1000);
    expect(savedToken.buyers).toBe(5);
    expect(savedToken.priceUSD).toBe(0.01);
    expect(savedToken.score).toBe(0); // Default score
    expect(savedToken.alertSent).toBe(false); // Default alert status
  });

  test('should retrieve the saved record by address', async () => {
    // First, save a token
    const tokenData = {
      address: TEST_TOKENS[1], // Wrapped SOL address
      name: 'Wrapped SOL',
      symbol: 'SOL',
      creator: 'So11111111111111111111111111111111111111112',
      launchTime: new Date('2024-01-01T10:00:00Z'),
      volume: 5000,
      buyers: 25,
      priceUSD: 100.50
    };

    const originalToken = new Token(tokenData);
    await originalToken.save();

    // Now try to retrieve it by address
    const foundToken = await Token.findOne({ address: TEST_TOKENS[1] });

    // Verify we found the correct token
    expect(foundToken).toBeTruthy();
    expect(foundToken.address).toBe(TEST_TOKENS[1]);
    expect(foundToken.name).toBe('Wrapped SOL');
    expect(foundToken.symbol).toBe('SOL');
    expect(foundToken.volume).toBe(5000);
    expect(foundToken.buyers).toBe(25);
    expect(foundToken.priceUSD).toBe(100.50);
    
    // Verify timestamps are preserved
    expect(foundToken.launchTime).toEqual(new Date('2024-01-01T10:00:00Z'));
    expect(foundToken.createdAt).toBeDefined();
    expect(foundToken.updatedAt).toBeDefined();
  });

  test('should handle duplicate address constraint', async () => {
    // Create first token
    const tokenData1 = {
      address: TEST_TOKENS[2], // USDC address
      name: 'USD Coin',
      symbol: 'USDC',
      creator: 'So11111111111111111111111111111111111111112',
      volume: 1000,
      buyers: 10,
      priceUSD: 1.00
    };

    const token1 = new Token(tokenData1);
    await token1.save();

    // Try to create another token with the same address
    const tokenData2 = {
      address: TEST_TOKENS[2], // Same USDC address
      name: 'Duplicate Token',
      symbol: 'DUP',
      creator: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      volume: 2000,
      buyers: 20,
      priceUSD: 2.00
    };

    const token2 = new Token(tokenData2);
    
    // Should throw a duplicate key error
    await expect(token2.save()).rejects.toThrow(/duplicate key/i);
    
    // Verify only one token exists
    const tokenCount = await Token.countDocuments({ address: TEST_TOKENS[2] });
    expect(tokenCount).toBe(1);
    
    // Verify the original token is unchanged
    const existingToken = await Token.findOne({ address: TEST_TOKENS[2] });
    expect(existingToken.name).toBe('USD Coin');
    expect(existingToken.symbol).toBe('USDC');
  });

  test('should validate required fields', async () => {
    // Try to save a token without required fields
    const incompleteToken = new Token({
      name: 'Incomplete Token',
      // Missing: address, symbol, creator
    });

    await expect(incompleteToken.save()).rejects.toThrow(/validation failed/i);
  });

  test('should save and update token metrics', async () => {
    // Create a token
    const token = new Token({
      address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      name: 'Metrics Test Token',
      symbol: 'MTT',
      creator: 'So11111111111111111111111111111111111111112',
      volume: 1000,
      buyers: 10,
      priceUSD: 0.05
    });

    await token.save();

    // Update metrics
    token.volume = 2500;
    token.buyers = 25;
    token.priceUSD = 0.08;
    
    // Calculate score using the model method
    const score = token.calculateScore();
    
    await token.save();

    // Retrieve and verify updates
    const updatedToken = await Token.findOne({ address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' });
    expect(updatedToken.volume).toBe(2500);
    expect(updatedToken.buyers).toBe(25);
    expect(updatedToken.priceUSD).toBe(0.08);
    expect(updatedToken.score).toBe(score);
    expect(updatedToken.score).toBeGreaterThan(0);
  });
});