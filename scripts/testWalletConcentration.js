const mongoose = require('mongoose');
const { 
  calculateEnhancedScore, 
  calculateWalletConcentrationScore,
  getConcentrationRisk 
} = require('../src/utils/enhancedScoring');
const Token = require('../src/models/token');
const config = require('../mvp/config');

// Test token data with different concentration scenarios
const TEST_TOKENS = [
  // Healthy distribution (low concentration)
  {
    mintAddress: 'test_healthy_1',
    name: 'Healthy Token',
    symbol: 'HEALTHY',
    liquidityAmount: 50000,
    holderCount: 1000,
    currentVolume: 250000,
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours old
    holderDistribution: Array(1000).fill(0).map((_, i) => ({
      address: `holder_${i}`,
      balance: 1000 + Math.random() * 100, // Even distribution
      percentage: 0.1 // Evenly distributed
    }))
  },
  
  // Risky distribution (medium concentration)
  {
    mintAddress: 'test_risky_1',
    name: 'Risky Token',
    symbol: 'RISKY',
    liquidityAmount: 15000,
    holderCount: 500,
    currentVolume: 75000,
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours old
    holderDistribution: (() => {
      const holders = [];
      // Top 5 wallets control 40%
      for (let i = 0; i < 5; i++) {
        holders.push({
          address: `whale_${i}`,
          balance: 20000,
          percentage: 8
        });
      }
      // Remaining 495 wallets share 60%
      for (let i = 0; i < 495; i++) {
        holders.push({
          address: `holder_${i}`,
          balance: 24.24,
          percentage: 0.12
        });
      }
      return holders;
    })()
  },
  
  // Manipulated distribution (high concentration)
  {
    mintAddress: 'test_manipulated_1',
    name: 'Manipulated Token',
    symbol: 'PUMP',
    liquidityAmount: 1000,
    holderCount: 100,
    currentVolume: 10000,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours old
    holderDistribution: (() => {
      const holders = [];
      // Top 3 wallets control 80%
      holders.push({ address: 'dev1', balance: 40000, percentage: 40 });
      holders.push({ address: 'dev2', balance: 25000, percentage: 25 });
      holders.push({ address: 'dev3', balance: 15000, percentage: 15 });
      
      // Remaining 97 wallets share 20%
      for (let i = 0; i < 97; i++) {
        holders.push({
          address: `holder_${i}`,
          balance: 20.62,
          percentage: 0.2
        });
      }
      return holders;
    })()
  }
];

async function testScoring() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('🚀 Testing Wallet Concentration Analysis\n');
    
    for (const tokenData of TEST_TOKENS) {
      // Calculate concentration score
      const concentration = calculateWalletConcentrationScore(tokenData.holderDistribution);
      const risk = getConcentrationRisk(concentration);
      
      // Calculate full enhanced score
      const enhancedScore = calculateEnhancedScore(tokenData, []);
      
      // Display results
      console.log(`\n📊 Token: ${tokenData.name} (${tokenData.symbol})`);
      console.log('='.repeat(50));
      console.log(`🔹 Holders: ${tokenData.holderCount.toLocaleString()}`);
      console.log(`🔹 Liquidity: ${tokenData.liquidityAmount.toLocaleString()} SOL`);
      console.log(`🔹 Volume (24h): ${tokenData.currentVolume.toLocaleString()} SOL`);
      console.log(`🔹 Age: ${Math.round((Date.now() - tokenData.createdAt) / (60 * 60 * 1000))} hours`);
      console.log(`🔹 Top 10 Wallets: ${concentration.top10pct.toFixed(2)}% of supply`);
      console.log(`🔹 Concentration Risk: ${risk.emoji} ${risk.label} (${risk.level})`);
      console.log(`🔹 Concentration Score: ${concentration.score}/12`);
      
      console.log('\n📈 Enhanced Score Breakdown:');
      console.log('-'.repeat(30));
      console.log(`Liquidity: ${enhancedScore.components.liquidity}/20`);
      console.log(`Holders: ${enhancedScore.components.holder}/18`);
      console.log(`Volume: ${enhancedScore.components.volume}/18`);
      console.log(`Age: ${enhancedScore.components.age}/14`);
      console.log(`Velocity: ${enhancedScore.components.velocity}/18`);
      console.log(`Concentration: ${enhancedScore.components.concentration}/12`);
      console.log('-' * 30);
      console.log(`TOTAL SCORE: ${enhancedScore.score}/100\n`);
      
      // Save token to database for further analysis
      const token = new Token({
        ...tokenData,
        concentrationRisk: {
          level: risk.level,
          score: concentration.score,
          top10pct: concentration.top10pct,
          updatedAt: new Date()
        }
      });
      
      await token.save();
      console.log(`✅ Saved ${token.symbol} to database\n`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error testing wallet concentration:', error);
    process.exit(1);
  }
}

testScoring();
