const { Connection, PublicKey } = require('@solana/web3.js');
const Transaction = require('../models/transaction');
const { parseTransaction } = require('../utils/transactionParser');

// Configure Solana connection
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Maximum number of signatures to fetch in one batch
const BATCH_SIZE = 100;

/**
 * Collect all transactions for a specific token
 * @param {string} tokenAddress - The token's mint address
 * @param {Object} options - Collection options
 * @param {number} options.maxTransactions - Maximum number of transactions to collect (default: all)
 * @param {boolean} options.forceUpdate - Whether to re-fetch transactions already in DB (default: false)
 * @returns {Promise<Object>} - Collection results
 */
async function collectTokenTransactions(tokenAddress, options = {}) {
  const { maxTransactions = Infinity, forceUpdate = false } = options;
  
  try {
    console.log(`Starting transaction collection for token: ${tokenAddress}`);
    const startTime = Date.now();
    const tokenPubkey = new PublicKey(tokenAddress);
    
    // Track collection stats
    const stats = {
      totalFound: 0,
      newTransactions: 0,
      updatedTransactions: 0,
      skippedTransactions: 0,
      errors: 0,
      processingTime: 0
    };
    
    // Get the most recent signature we already have in the database
    let lastSignature = null;
    if (!forceUpdate) {
      const latestTx = await Transaction.findOne({ tokenAddress })
        .sort({ blockTime: -1 })
        .select('signature')
        .lean();
      
      if (latestTx) {
        lastSignature = latestTx.signature;
        console.log(`Continuing collection from signature: ${lastSignature}`);
      }
    }
    
    // Collect signatures in batches
    let allSignatures = [];
    let hasMore = true;
    let options = { limit: BATCH_SIZE };
    
    if (lastSignature) {
      options.until = lastSignature;
    }
    
    while (hasMore && allSignatures.length < maxTransactions) {
      console.log(`Fetching batch of signatures (total so far: ${allSignatures.length})...`);
      
      const signatures = await connection.getSignaturesForAddress(
        tokenPubkey,
        options
      );
      
      stats.totalFound += signatures.length;
      
      if (signatures.length === 0) {
        hasMore = false;
      } else {
        allSignatures = allSignatures.concat(signatures);
        
        // Update options for next batch
        options.before = signatures[signatures.length - 1].signature;
        
        // If we've hit our limit, stop collecting
        if (allSignatures.length >= maxTransactions) {
          allSignatures = allSignatures.slice(0, maxTransactions);
          hasMore = false;
        }
      }
    }
    
    console.log(`Found ${allSignatures.length} total signatures for processing`);
    
    // Process each signature
    for (let i = 0; i < allSignatures.length; i++) {
      const sig = allSignatures[i];
      
      // Check if we already have this transaction (if not forcing update)
      if (!forceUpdate) {
        const existingTx = await Transaction.findOne({ signature: sig.signature });
        if (existingTx) {
          stats.skippedTransactions++;
          continue;
        }
      }
      
      try {
        // Get full transaction data
        const txData = await connection.getParsedTransaction(
          sig.signature,
          { maxSupportedTransactionVersion: 0 }
        );
        
        if (!txData) {
          console.warn(`No data found for transaction: ${sig.signature}`);
          stats.errors++;
          continue;
        }
        
        // Extract transaction details
        const transactionData = await parseTransactionData(txData, sig, tokenAddress);
        
        // Save to database (upsert to handle force updates)
        const result = await Transaction.updateOne(
          { signature: sig.signature },
          { $set: transactionData },
          { upsert: true }
        );
        
        if (result.upsertedCount > 0) {
          stats.newTransactions++;
        } else if (result.modifiedCount > 0) {
          stats.updatedTransactions++;
        }
        
        // Log progress for every 10 transactions
        if ((i + 1) % 10 === 0 || i === allSignatures.length - 1) {
          console.log(`Processed ${i + 1}/${allSignatures.length} transactions`);
        }
      } catch (error) {
        console.error(`Error processing transaction ${sig.signature}:`, error.message);
        stats.errors++;
        
        // Store the error in the database for debugging
        await Transaction.updateOne(
          { signature: sig.signature },
          { 
            $set: { 
              tokenAddress,
              signature: sig.signature,
              blockTime: sig.blockTime,
              timestamp: new Date(sig.blockTime * 1000),
              processed: false
            },
            $push: { processingErrors: error.message }
          },
          { upsert: true }
        );
      }
    }
    
    // Calculate processing time
    stats.processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`Transaction collection completed in ${stats.processingTime.toFixed(2)}s`);
    console.log(`Results: ${stats.newTransactions} new, ${stats.updatedTransactions} updated, ${stats.skippedTransactions} skipped, ${stats.errors} errors`);
    
    return {
      success: true,
      tokenAddress,
      stats
    };
  } catch (error) {
    console.error(`Failed to collect transactions for ${tokenAddress}:`, error);
    return {
      success: false,
      tokenAddress,
      error: error.message
    };
  }
}

/**
 * Parse transaction data to extract relevant information
 * @param {Object} txData - Transaction data from Solana RPC
 * @param {Object} sigData - Signature data with metadata
 * @param {string} tokenAddress - The token's mint address
 * @returns {Object} - Parsed transaction data
 */
async function parseTransactionData(txData, sigData, tokenAddress) {
  // Use the improved transaction parser
  return parseTransaction(txData, sigData, tokenAddress);
}

// These functions have been replaced by the improved parser in transactionParser.js

/**
 * Get transactions for a token within a time range
 * @param {string} tokenAddress - The token's mint address
 * @param {Object} options - Query options
 * @param {Date} options.startTime - Start time for query
 * @param {Date} options.endTime - End time for query
 * @param {number} options.limit - Maximum number of transactions to return
 * @param {string} options.type - Filter by transaction type
 * @returns {Promise<Array>} - Matching transactions
 */
async function getTokenTransactions(tokenAddress, options = {}) {
  const {
    startTime,
    endTime,
    limit = 100,
    type
  } = options;
  
  // Build query
  const query = { tokenAddress };
  
  if (startTime || endTime) {
    query.timestamp = {};
    if (startTime) query.timestamp.$gte = startTime;
    if (endTime) query.timestamp.$lte = endTime;
  }
  
  if (type) {
    query.transactionType = type;
  }
  
  // Execute query
  return Transaction.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
}

/**
 * Get transaction statistics for a token
 * @param {string} tokenAddress - The token's mint address
 * @returns {Promise<Object>} - Transaction statistics
 */
async function getTokenTransactionStats(tokenAddress) {
  // Get total transaction count
  const totalCount = await Transaction.countDocuments({ tokenAddress });
  
  // Get counts by type
  const typeCounts = await Transaction.aggregate([
    { $match: { tokenAddress } },
    { $group: { _id: '$transactionType', count: { $sum: 1 } } }
  ]);
  
  // Get transaction volume over time
  const hourlyVolume = await Transaction.aggregate([
    { $match: { tokenAddress } },
    {
      $group: {
        _id: {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' },
          hour: { $hour: '$timestamp' }
        },
        volume: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
  ]);
  
  // Get unique wallet count
  const uniqueWallets = await Transaction.aggregate([
    { $match: { tokenAddress } },
    { $unwind: '$involvedWallets' },
    { $group: { _id: '$involvedWallets' } },
    { $group: { _id: null, count: { $sum: 1 } } }
  ]);
  
  // Format the results
  const typeCountsMap = {};
  typeCounts.forEach(item => {
    typeCountsMap[item._id] = item.count;
  });
  
  return {
    totalTransactions: totalCount,
    transactionsByType: typeCountsMap,
    uniqueWallets: uniqueWallets[0]?.count || 0,
    hourlyVolume: hourlyVolume.map(item => ({
      timestamp: new Date(
        item._id.year,
        item._id.month - 1,
        item._id.day,
        item._id.hour
      ),
      volume: item.volume,
      count: item.count
    }))
  };
}

module.exports = {
  collectTokenTransactions,
  getTokenTransactions,
  getTokenTransactionStats
};
