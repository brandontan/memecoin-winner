/**
 * Enhanced Transaction Reprocessing Script
 * Uses the improved transaction parser to correctly classify unknown transactions
 */

const mongoose = require('mongoose');
const { Connection } = require('@solana/web3.js');
const Transaction = require('../src/models/transaction');
const enhancedParser = require('../src/utils/transactionParserEnhanced');

// Connect to MongoDB
const MONGODB_URI = 'mongodb://localhost:27017/memecoin';

// Configure Solana connection with rate limiting
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Sleep function for rate limiting
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch transaction with retry and rate limiting
async function fetchTransactionWithRetry(signature, maxRetries = 5) {
  let retries = 0;
  let delay = 500; // Start with 500ms delay
  
  while (retries < maxRetries) {
    try {
      const txData = await connection.getParsedTransaction(
        signature,
        { maxSupportedTransactionVersion: 0 }
      );
      return txData;
    } catch (error) {
      retries++;
      if (error.message.includes('429') || error.message.includes('Too many requests')) {
        console.log(`Server responded with 429 Too Many Requests.  Retrying after ${delay}ms delay...`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
      } else if (retries < maxRetries) {
        console.log(`Error fetching transaction: ${error.message}. Retrying after ${delay}ms delay...`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
  
  throw new Error(`Failed to fetch transaction after ${maxRetries} retries`);
}

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get all transactions
    const transactions = await Transaction.find().lean();
    console.log(`Found ${transactions.length} total transactions to analyze`);
    
    // Stats for tracking changes
    const stats = {
      total: transactions.length,
      updated: 0,
      byType: {}
    };
    
    // Process each transaction
    const updatedTransactions = [];
    
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      console.log(`[${i+1}/${transactions.length}] Processing transaction: ${tx.signature}`);
      
      try {
        // Fetch transaction data
        const txData = await fetchTransactionWithRetry(tx.signature);
        
        if (!txData) {
          console.log(`No data found for transaction ${tx.signature}`);
          continue;
        }
        
        // Parse transaction with enhanced parser
        const parsedTx = enhancedParser.parseTransaction(txData, tx.tokenAddress);
        
        // Check if transaction type has changed
        const hasChanged = (
          tx.transactionType !== parsedTx.transactionType ||
          tx.fromWallet !== parsedTx.fromWallet ||
          tx.toWallet !== parsedTx.toWallet ||
          tx.amount !== parsedTx.amount ||
          tx.isLiquidityOperation !== parsedTx.isLiquidityOperation
        );
        
        if (hasChanged) {
          // Update transaction
          updatedTransactions.push({
            _id: tx._id,
            transactionType: parsedTx.transactionType,
            fromWallet: parsedTx.fromWallet,
            toWallet: parsedTx.toWallet,
            amount: parsedTx.amount,
            isLiquidityOperation: parsedTx.isLiquidityOperation,
            liquidityChangeAmount: parsedTx.liquidityChangeAmount,
            processed: true,
            processingErrors: []
          });
          
          stats.updated++;
          stats.byType[parsedTx.transactionType] = (stats.byType[parsedTx.transactionType] || 0) + 1;
          
          console.log(`  Updated: ${tx.transactionType} -> ${parsedTx.transactionType}`);
          console.log(`  Amount: ${parsedTx.amount}`);
          if (parsedTx.fromWallet) console.log(`  From: ${parsedTx.fromWallet}`);
          if (parsedTx.toWallet) console.log(`  To: ${parsedTx.toWallet}`);
        } else {
          console.log(`  No changes needed`);
        }
        
        // Rate limiting
        if (i < transactions.length - 1) {
          await sleep(1000);
        }
      } catch (error) {
        console.error(`Error reprocessing transaction ${tx.signature}:`, error);
      }
    }
    
    // Update transactions in the database
    if (updatedTransactions.length > 0) {
      console.log('Updating transactions in the database...');
      
      for (const tx of updatedTransactions) {
        await Transaction.updateOne(
          { _id: tx._id },
          { $set: tx }
        );
      }
      
      console.log(`Updated ${updatedTransactions.length} transactions in the database`);
    }
    
    // Print reprocessing stats
    console.log('\nReprocessing stats:');
    console.log(JSON.stringify(stats, null, 2));
    
    // Get sample transactions by type
    console.log('\nSample transactions by type:');
    
    for (const type of Object.keys(stats.byType)) {
      const sampleTx = await Transaction.findOne({ transactionType: type }).lean();
      
      if (sampleTx) {
        console.log(`\n${type.toUpperCase()} TRANSACTION EXAMPLE:`);
        console.log(JSON.stringify({
          signature: sampleTx.signature,
          timestamp: sampleTx.timestamp,
          transactionType: sampleTx.transactionType,
          fromWallet: sampleTx.fromWallet,
          toWallet: sampleTx.toWallet,
          amount: sampleTx.amount,
          isLiquidityOperation: sampleTx.isLiquidityOperation,
          liquidityChangeAmount: sampleTx.liquidityChangeAmount
        }, null, 2));
      }
    }
    
    // Get updated transaction statistics
    console.log('\nUpdated transaction statistics:');
    
    // Count by type
    const transactionsByType = await Transaction.aggregate([
      { $group: { _id: '$transactionType', count: { $sum: 1 } } }
    ]);
    
    console.log('Transactions by type:');
    const typeCountMap = {};
    transactionsByType.forEach(item => {
      typeCountMap[item._id] = item.count;
    });
    console.log(JSON.stringify(typeCountMap, null, 2));
    
    // Volume by type
    const volumeByType = await Transaction.aggregate([
      { $match: { amount: { $exists: true, $ne: null } } },
      { $group: {
        _id: '$transactionType',
        totalVolume: { $sum: { $toDouble: '$amount' } },
        avgAmount: { $avg: { $toDouble: '$amount' } },
        count: { $sum: 1 }
      }}
    ]);
    
    console.log('\nVolumes by transaction type:');
    console.log(JSON.stringify(volumeByType, null, 2));
    
    // Hourly activity
    const hourlyActivity = await Transaction.aggregate([
      { $match: { timestamp: { $exists: true } } },
      { $group: {
        _id: {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' },
          hour: { $hour: '$timestamp' }
        },
        count: { $sum: 1 },
        volume: { $sum: { $toDouble: '$amount' } }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } },
      { $project: {
        _id: 0,
        timestamp: {
          $concat: [
            { $toString: '$_id.year' }, '-',
            { $toString: '$_id.month' }, '-',
            { $toString: '$_id.day' }, ' ',
            { $toString: '$_id.hour' }, ':00'
          ]
        },
        count: 1,
        volume: 1
      }}
    ]);
    
    console.log('\nHourly activity:');
    console.log(JSON.stringify(hourlyActivity, null, 2));
    
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
