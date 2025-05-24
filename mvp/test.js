const database = require('./utils/database');
const Token = require('./models/token');
const monitor = require('./services/monitor');
const scorer = require('./services/scorer');
const logger = require('./utils/logger');

// Simple test suite for MVP
async function runTests() {
  logger.info('🧪 Starting MVP Tests...');
  
  try {
    // Test 1: Database Connection
    await testDatabaseConnection();
    
    // Test 2: Token Model
    await testTokenModel();
    
    // Test 3: Scoring Logic
    await testScoringLogic();
    
    // Test 4: Alert Logic
    await testAlertLogic();
    
    logger.info('✅ All tests passed!');
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await database.disconnect();
  }
}

async function testDatabaseConnection() {
  logger.info('Testing database connection...');
  await database.connect();
  
  // Clean up any existing test data
  await Token.deleteMany({ symbol: 'TEST' });
  
  logger.info('✅ Database connection test passed');
}

async function testTokenModel() {
  logger.info('Testing token model...');
  
  // Create test token
  const testToken = new Token({
    address: 'TEST123456789',
    name: 'Test Token',
    symbol: 'TEST',
    creator: 'CREATOR123456789',
    volume: 1000,
    buyers: 10,
    priceUSD: 0.01
  });
  
  await testToken.save();
  
  // Test score calculation
  const score = testToken.calculateScore();
  if (score < 0 || score > 100) {
    throw new Error(`Invalid score: ${score}`);
  }
  
  // Test alert logic
  testToken.score = 85;
  if (!testToken.shouldAlert()) {
    throw new Error('Should alert for score 85');
  }
  
  await testToken.markAlertSent();
  if (testToken.shouldAlert()) {
    throw new Error('Should not alert after marking as sent');
  }
  
  // Clean up
  await testToken.deleteOne();
  
  logger.info('✅ Token model test passed');
}

async function testScoringLogic() {
  logger.info('Testing scoring logic...');
  
  const token = new Token({
    address: 'SCORE_TEST_123',
    name: 'Score Test Token',
    symbol: 'SCORE',
    creator: 'CREATOR123456789',
    launchTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    volume: 5000,
    buyers: 50,
    priceUSD: 0.02
  });
  
  const score = token.calculateScore();
  
  // Score should be: (5000 * 50) / 1 hour / 1000 = 250 (capped at 100)
  if (score !== 100) {
    throw new Error(`Expected score 100, got ${score}`);
  }
  
  // Test with smaller values
  token.volume = 100;
  token.buyers = 2;
  const lowScore = token.calculateScore();
  
  if (lowScore >= 100) {
    throw new Error(`Low score should be < 100, got ${lowScore}`);
  }
  
  await token.deleteOne();
  
  logger.info('✅ Scoring logic test passed');
}

async function testAlertLogic() {
  logger.info('Testing alert logic...');
  
  const highScoreToken = new Token({
    address: 'ALERT_TEST_123',
    name: 'Alert Test Token',
    symbol: 'ALERT',
    creator: 'CREATOR123456789',
    volume: 10000,
    buyers: 100,
    score: 90
  });
  
  await highScoreToken.save();
  
  // Should trigger alert
  if (!highScoreToken.shouldAlert()) {
    throw new Error('Should alert for high score token');
  }
  
  // Mark as alerted
  await highScoreToken.markAlertSent();
  
  // Should not alert again
  if (highScoreToken.shouldAlert()) {
    throw new Error('Should not alert twice');
  }
  
  await highScoreToken.deleteOne();
  
  logger.info('✅ Alert logic test passed');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };