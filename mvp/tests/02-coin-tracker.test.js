const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const Token = require('../models/token');
const logger = require('../utils/logger');

// Real Solana token addresses for testing
const TEST_TOKENS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
  'So11111111111111111111111111111111111111112',  // Wrapped SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'  // USDT
];

describe('Test 2: Coin Tracker Test', () => {
  let mongoServer;
  let mongoUri;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info('Connected to in-memory MongoDB for coin tracker testing');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    logger.info('Disconnected from test database');
  });

  beforeEach(async () => {
    await Token.deleteMany({});
  });

  test('should create coin profiles with starting stats', async () => {
    // Create a new coin profile like when DogeCoin first launches
    const newCoin = new Token({
      address: TEST_TOKENS[0],
      name: 'DogeCoin Test',
      symbol: 'DOGE',
      creator: 'So11111111111111111111111111111111111111112',
      launchTime: new Date(),
      volume: 1000,      // Starting with $1000 volume
      buyers: 50,        // 50 initial holders
      priceUSD: 0.001    // Starting price $0.001
    });

    await newCoin.save();

    // Verify the coin profile was created correctly
    expect(newCoin.address).toBe(TEST_TOKENS[0]);
    expect(newCoin.name).toBe('DogeCoin Test');
    expect(newCoin.volume).toBe(1000);
    expect(newCoin.buyers).toBe(50);
    expect(newCoin.priceUSD).toBe(0.001);
    expect(newCoin.score).toBe(0); // Default score before calculation
    expect(newCoin.alertSent).toBe(false);
    expect(newCoin.launchTime).toBeDefined();
  });

  test('should update trading stats when people buy/sell', async () => {
    // Create initial coin
    const coin = new Token({
      address: TEST_TOKENS[1],
      name: 'Test Coin',
      symbol: 'TEST',
      creator: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      launchTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      volume: 1000,
      buyers: 50,
      priceUSD: 0.001
    });

    await coin.save();

    // Simulate trading activity - more people buying, volume increasing
    coin.volume = 5000;     // Volume increased 5x
    coin.buyers = 200;      // Holders increased 4x
    coin.priceUSD = 0.003;  // Price tripled

    await coin.save();

    // Verify stats were updated
    const updatedCoin = await Token.findOne({ address: TEST_TOKENS[1] });
    expect(updatedCoin.volume).toBe(5000);
    expect(updatedCoin.buyers).toBe(200);
    expect(updatedCoin.priceUSD).toBe(0.003);
  });

  test('should calculate trend scores based on growing stats', async () => {
    // Test coin with high volume and buyers (should get high score)
    const hotCoin = new Token({
      address: TEST_TOKENS[2],
      name: 'Hot Coin',
      symbol: 'HOT',
      creator: 'So11111111111111111111111111111111111111112',
      launchTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      volume: 50000,    // High volume
      buyers: 500,      // Many buyers
      priceUSD: 0.01
    });

    // Calculate score using the formula: volume × buyers ÷ hours_since_launch
    const score = hotCoin.calculateScore();

    // Expected: (50000 × 500) ÷ 1 hour ÷ 1000 = 25000 (capped at 100)
    expect(score
