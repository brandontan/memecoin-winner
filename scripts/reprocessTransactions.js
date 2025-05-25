const mongoose = require('mongoose');
const { Connection } = require('@solana/web3.js');
const Transaction = require('../src/models/transaction');
const { reprocessTransactions } = require('../src/utils/transactionParser');

// Token to analyze
const TOKEN_ADDRESS = '3e68JicuTepVb2p7p6ajHyB3FembdXfp7UF35RufHK37';

// Connect to MongoDB
const MONGODB_URI = 'mongodb://localhost:27017/memecoin';

// Configure Solana connection
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get all transactions for our token
    console.log(`Fetching transactions for token: ${TOKEN_ADDRESS}`);
    const transactions = await Transaction.find({ tokenAddress: TOKEN_ADDRESS }).lean();
    console.log(`Found ${transactions.length} transactions to reprocess`);
    
    if (transactions.length === 0) {
      console.log('No transactions to reprocess');
      await mongoose.disconnect();
      return;
    }
    
    // Reprocess transactions with improved parser
    console.log('Reprocessing transactions with improved parser...');
    const { updatedTransactions, stats } = await reprocessTransactions(transactions, connection);
    
    console.log('Reprocessing stats:');
    console.log(JSON.stringify(stats, null, 2));
    
    // Update transactions in the database
    console.log('Updating transactions in the database...');
    let updateCount = 0;
    
    for (const tx of updatedTransactions) {
      const result = await Transaction.updateOne(
        { signature: tx.signature },
        { $set: tx }
      );
      
      if (result.modifiedCount > 0) {
        updateCount++;
      }
    }
    
    console.log(`Updated ${updateCount} transactions in the database`);
    
    // Get sample transactions of each type
    console.log('\nSample transactions by type:');
    const types = Object.keys(stats.byType || {});
    
    for (const type of types) {
      const sample = await Transaction.findOne({ 
        tokenAddress: TOKEN_ADDRESS,
        transactionType: type
      }).lean();
      
      if (sample) {
        console.log(`\n${type.toUpperCase()} TRANSACTION EXAMPLE:`);
        console.log(JSON.stringify({
          signature: sample.signature,
          timestamp: sample.timestamp,
          transactionType: sample.transactionType,
          fromWallet: sample.fromWallet,
          toWallet: sample.toWallet,
          amount: sample.amount,
          isLiquidityOperation: sample.isLiquidityOperation,
          liquidityChangeAmount: sample.liquidityChangeAmount,
          context: sample.context
        }, null, 2));
      }
    }
    
    // Get updated transaction stats
    console.log('\nUpdated transaction statistics:');
    
    // Count by type
    const typeCounts = await Transaction.aggregate([
      { $match: { tokenAddress: TOKEN_ADDRESS } },
      { $group: { _id: '$transactionType', count: { $sum: 1 } } }
    ]);
    
    console.log('Transactions by type:');
    console.log(JSON.stringify(typeCounts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}), null, 2));
    
    // Calculate volumes by type
    const volumes = await Transaction.aggregate([
      { 
        $match: { 
          tokenAddress: TOKEN_ADDRESS,
          amount: { $exists: true, $ne: null, $gt: 0 }
        } 
      },
      { 
        $group: { 
          _id: '$transactionType', 
          totalVolume: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' },
          count: { $sum: 1 }
        } 
      }
    ]);
    
    console.log('\nVolumes by transaction type:');
    console.log(JSON.stringify(volumes, null, 2));
    
    // Get hourly transaction counts
    const hourlyActivity = await Transaction.aggregate([
      { $match: { tokenAddress: TOKEN_ADDRESS } },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' },
            hour: { $hour: '$timestamp' }
          },
          count: { $sum: 1 },
          volume: { $sum: { $ifNull: ['$amount', 0] } }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
    ]);
    
    console.log('\nHourly activity:');
    console.log(JSON.stringify(hourlyActivity.map(item => ({
      timestamp: `${item._id.year}-${item._id.month}-${item._id.day} ${item._id.hour}:00`,
      count: item.count,
      volume: item.volume
    })), null, 2));
    
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
