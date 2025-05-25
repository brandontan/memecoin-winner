/**
 * Update token with enhanced scoring algorithm
 */
const mongoose = require('mongoose');
const Token = require('../src/models/token.ts');
const Transaction = require('../src/models/transaction');
const { calculateEnhancedScore } = require('../src/utils/enhancedScoring');

// Connect to MongoDB
const MONGODB_URI = 'mongodb://localhost:27017/memecoin';

// Target token address
const TOKEN_ADDRESS = '3e68JicuTepVb2p7p6ajHyB3FembdXfp7UF35RufHK37';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get token data
    const token = await Token.findOne({ mintAddress: TOKEN_ADDRESS });
    
    if (!token) {
      console.error(`Token with address ${TOKEN_ADDRESS} not found`);
      process.exit(1);
    }
    
    console.log(`\nToken: ${token.name} (${token.symbol})`);
    console.log(`Mint Address: ${token.mintAddress}`);
    console.log(`Current Score: ${token.potentialScore}`);
    
    // Get token transactions
    const transactions = await Transaction.find({ tokenAddress: TOKEN_ADDRESS });
    console.log(`Found ${transactions.length} transactions`);
    
    // Calculate enhanced score
    const enhancedScore = calculateEnhancedScore(token, transactions);
    console.log(`\nEnhanced Score: ${enhancedScore}`);
    
    // Show score components
    const { calculateLiquidityScore, calculateHolderScore, calculateVolumeScore, calculateAgeScore, calculateTransactionVelocityScore } = require('../src/utils/enhancedScoring');
    
    const liquidityScore = calculateLiquidityScore(token.liquidityAmount);
    const holderScore = calculateHolderScore(token.holderCount);
    const volumeScore = calculateVolumeScore(token.currentVolume);
    const ageScore = calculateAgeScore(token.createdAt);
    const velocityScore = calculateTransactionVelocityScore(transactions, token.createdAt);
    
    console.log('\nScore Components:');
    console.log(`- Liquidity Score (${token.liquidityAmount}): ${liquidityScore}/25`);
    console.log(`- Holder Score (${token.holderCount}): ${holderScore}/20`);
    console.log(`- Volume Score (${token.currentVolume}): ${volumeScore}/20`);
    console.log(`- Age Score (${new Date(token.createdAt).toISOString()}): ${ageScore}/15`);
    console.log(`- Transaction Velocity Score (${transactions.length} txs): ${velocityScore}/20`);
    console.log(`- Total: ${enhancedScore}/100`);
    
    // Update token with new score
    console.log('\nUpdating token with enhanced score...');
    token.potentialScore = enhancedScore;
    await token.save();
    console.log('Token updated successfully');
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main();
