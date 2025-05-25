const mongoose = require('mongoose');
const Transaction = require('../src/models/transaction');

// Token to analyze
const TOKEN_ADDRESS = '3e68JicuTepVb2p7p6ajHyB3FembdXfp7UF35RufHK37';

// Connect to MongoDB
const MONGODB_URI = 'mongodb://localhost:27017/memecoin';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Check if we have any transactions for this token
    const count = await Transaction.countDocuments({ tokenAddress: TOKEN_ADDRESS });
    console.log(`Found ${count} transactions for token ${TOKEN_ADDRESS}`);
    
    if (count > 0) {
      // Get a sample transaction
      const transaction = await Transaction.findOne({ tokenAddress: TOKEN_ADDRESS });
      console.log('Sample transaction document:');
      console.log(JSON.stringify(transaction, null, 2));
      
      // Get transaction types
      const types = await Transaction.distinct('transactionType', { tokenAddress: TOKEN_ADDRESS });
      console.log('Transaction types found:', types);
      
      // Get sample of each type
      for (const type of types) {
        const typeSample = await Transaction.findOne({ 
          tokenAddress: TOKEN_ADDRESS,
          transactionType: type
        });
        
        console.log(`\nSample ${type} transaction:`);
        console.log(JSON.stringify(typeSample, null, 2));
      }
    } else {
      console.log('No transactions found. Let\'s create a sample transaction for demonstration.');
      
      // Create a sample transaction to show the structure
      const sampleTransaction = new Transaction({
        signature: 'sample_signature_123456789',
        tokenAddress: TOKEN_ADDRESS,
        blockTime: Math.floor(Date.now() / 1000),
        timestamp: new Date(),
        slot: 123456789,
        transactionType: 'buy',
        fromWallet: 'sample_seller_wallet_address',
        toWallet: 'sample_buyer_wallet_address',
        involvedWallets: ['sample_seller_wallet_address', 'sample_buyer_wallet_address', 'sample_liquidity_pool_address'],
        amount: 1000,
        isLiquidityOperation: false,
        processed: true
      });
      
      // Save the sample transaction
      await sampleTransaction.save();
      console.log('Created sample transaction:');
      console.log(JSON.stringify(sampleTransaction, null, 2));
    }
    
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
