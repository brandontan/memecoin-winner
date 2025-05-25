const mongoose = require('mongoose');
const Transaction = require('../src/models/transaction');
const fs = require('fs');

// Connect to MongoDB
const MONGODB_URI = 'mongodb://localhost:27017/memecoin';

// Token to analyze
const TOKEN_ADDRESS = '3e68JicuTepVb2p7p6ajHyB3FembdXfp7UF35RufHK37';

// Program IDs we want to identify
const KNOWN_PROGRAMS = {
  // Solana native programs
  '11111111111111111111111111111111': 'System Program',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token Program',
  'ComputeBudget111111111111111111111111111111': 'Compute Budget Program',
  
  // DEX and Swap Programs
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'Jupiter Aggregator',
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter v6',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX': 'Serum v3',
  '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin': 'Serum v3 (old)',
  'RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr': 'Raydium',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium Liquidity Pool',
  
  // Other common programs
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s': 'Metaplex Token Metadata',
  
  // Programs we found in our analysis
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'Phoenix DEX',
  '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf': 'Unknown Program 1',
  'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1': 'Unknown Program 2'
};

// Helper function to extract program IDs from raw transaction data
function extractProgramIds(rawTransaction) {
  try {
    const txData = JSON.parse(rawTransaction);
    const programIds = new Set();
    
    // Extract from main instructions
    if (txData.transaction?.message?.instructions) {
      txData.transaction.message.instructions.forEach(ix => {
        if (ix.programId) {
          programIds.add(ix.programId.toString());
        }
      });
    }
    
    // Extract from inner instructions
    if (txData.meta?.innerInstructions) {
      txData.meta.innerInstructions.forEach(innerSet => {
        if (innerSet.instructions) {
          innerSet.instructions.forEach(ix => {
            if (ix.programId) {
              programIds.add(ix.programId.toString());
            }
          });
        }
      });
    }
    
    return Array.from(programIds);
  } catch (error) {
    console.error('Error parsing transaction data:', error.message);
    return [];
  }
}

// Helper function to analyze token balance changes
function analyzeTokenBalances(rawTransaction, tokenAddress) {
  try {
    const txData = JSON.parse(rawTransaction);
    const preBalances = txData.meta?.preTokenBalances || [];
    const postBalances = txData.meta?.postTokenBalances || [];
    
    // Filter for our token
    const preTokenBalances = preBalances.filter(b => b.mint === tokenAddress);
    const postTokenBalances = postBalances.filter(b => b.mint === tokenAddress);
    
    // Create maps for easier lookup
    const preBalanceMap = new Map();
    const postBalanceMap = new Map();
    
    preTokenBalances.forEach(balance => {
      preBalanceMap.set(balance.owner, {
        amount: balance.uiTokenAmount.uiAmount || 0,
        accountIndex: balance.accountIndex
      });
    });
    
    postTokenBalances.forEach(balance => {
      postBalanceMap.set(balance.owner, {
        amount: balance.uiTokenAmount.uiAmount || 0,
        accountIndex: balance.accountIndex
      });
    });
    
    // Calculate changes
    const changes = [];
    
    // Combine all owners
    const allOwners = new Set([...preBalanceMap.keys(), ...postBalanceMap.keys()]);
    
    allOwners.forEach(owner => {
      const preBal = preBalanceMap.get(owner)?.amount || 0;
      const postBal = postBalanceMap.get(owner)?.amount || 0;
      const change = postBal - preBal;
      
      if (change !== 0) {
        changes.push({
          owner,
          preBal,
          postBal,
          change
        });
      }
    });
    
    return {
      preTokenBalances,
      postTokenBalances,
      changes
    };
  } catch (error) {
    console.error('Error analyzing token balances:', error.message);
    return { changes: [] };
  }
}

// Helper function to check for DEX interactions
function hasDexInteraction(programIds) {
  const dexProgramIds = [
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // Jupiter
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca
    'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX', // Serum v3
    '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', // Serum v3 (old)
    'RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr', // Raydium
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium Liquidity Pool
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'  // Phoenix DEX
  ];
  
  return programIds.some(id => dexProgramIds.includes(id));
}

// Helper function to determine transaction type based on program IDs and token changes
function determineTransactionType(programIds, tokenBalanceChanges) {
  // Check for DEX interactions
  const isDexInteraction = hasDexInteraction(programIds);
  
  // Check for token balance changes
  const hasTokenBalanceChanges = tokenBalanceChanges.changes.length > 0;
  
  if (hasTokenBalanceChanges) {
    if (tokenBalanceChanges.changes.length >= 2) {
      // If there are multiple wallets with balance changes, it's likely a transfer
      return 'transfer';
    } else if (tokenBalanceChanges.changes.length === 1) {
      const change = tokenBalanceChanges.changes[0];
      if (change.preBal === 0 && change.postBal > 0) {
        return 'mint';
      } else if (change.preBal > 0 && change.postBal === 0) {
        return 'burn';
      }
    }
  }
  
  if (isDexInteraction) {
    // If there's a DEX interaction but no token balance changes for our token,
    // it might be a swap involving other tokens
    return 'dex_interaction';
  }
  
  // Check if it's just a token program interaction
  const hasTokenProgramInteraction = programIds.includes('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  if (hasTokenProgramInteraction) {
    return 'token_operation';
  }
  
  return 'administrative';
}

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get all unknown transactions
    console.log(`Fetching unknown transactions for token: ${TOKEN_ADDRESS}`);
    const unknownTransactions = await Transaction.find({ 
      tokenAddress: TOKEN_ADDRESS,
      transactionType: 'unknown',
      rawTransaction: { $exists: true, $ne: null }  // Only get transactions with raw data
    }).lean();
    
    console.log(`Found ${unknownTransactions.length} unknown transactions to analyze`);
    
    if (unknownTransactions.length === 0) {
      console.log('No unknown transactions to analyze');
      await mongoose.disconnect();
      return;
    }
    
    // Collect statistics
    const stats = {
      totalTransactions: unknownTransactions.length,
      programCounts: {},
      transactionTypes: {},
      dexInteractions: 0,
      tokenBalanceChanges: 0,
      tokenProgramInteractions: 0,
      detailedSamples: {}
    };
    
    // Analyze each transaction
    for (let i = 0; i < unknownTransactions.length; i++) {
      const tx = unknownTransactions[i];
      
      if (!tx.rawTransaction) {
        console.log(`Transaction ${tx.signature} has no raw data, skipping`);
        continue;
      }
      
      // Extract program IDs
      const programIds = extractProgramIds(tx.rawTransaction);
      
      // Count program usage
      programIds.forEach(programId => {
        stats.programCounts[programId] = (stats.programCounts[programId] || 0) + 1;
      });
      
      // Analyze token balances
      const tokenBalances = analyzeTokenBalances(tx.rawTransaction, TOKEN_ADDRESS);
      
      // Determine transaction type
      const txType = determineTransactionType(programIds, tokenBalances);
      stats.transactionTypes[txType] = (stats.transactionTypes[txType] || 0) + 1;
      
      // Count specific characteristics
      if (hasDexInteraction(programIds)) {
        stats.dexInteractions++;
      }
      
      if (tokenBalances.changes.length > 0) {
        stats.tokenBalanceChanges++;
      }
      
      if (programIds.includes('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')) {
        stats.tokenProgramInteractions++;
      }
      
      // Store detailed samples for each transaction type (only first occurrence)
      if (!stats.detailedSamples[txType] && tx.rawTransaction) {
        stats.detailedSamples[txType] = {
          signature: tx.signature,
          programIds: programIds.map(id => ({
            id,
            name: KNOWN_PROGRAMS[id] || 'Unknown Program'
          })),
          tokenBalanceChanges: tokenBalances.changes,
          rawData: JSON.parse(tx.rawTransaction)
        };
      }
    }
    
    // Calculate percentages
    const percentages = {
      dexInteractions: (stats.dexInteractions / stats.totalTransactions) * 100,
      tokenBalanceChanges: (stats.tokenBalanceChanges / stats.totalTransactions) * 100,
      tokenProgramInteractions: (stats.tokenProgramInteractions / stats.totalTransactions) * 100
    };
    
    // Sort programs by frequency
    const sortedPrograms = Object.entries(stats.programCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([programId, count]) => ({
        programId,
        name: KNOWN_PROGRAMS[programId] || 'Unknown Program',
        count,
        percentage: (count / stats.totalTransactions) * 100
      }));
    
    // Generate report
    const report = {
      totalUnknownTransactions: stats.totalTransactions,
      transactionTypeBreakdown: stats.transactionTypes,
      programFrequency: sortedPrograms.slice(0, 10), // Top 10 programs
      characteristics: {
        dexInteractions: {
          count: stats.dexInteractions,
          percentage: percentages.dexInteractions
        },
        tokenBalanceChanges: {
          count: stats.tokenBalanceChanges,
          percentage: percentages.tokenBalanceChanges
        },
        tokenProgramInteractions: {
          count: stats.tokenProgramInteractions,
          percentage: percentages.tokenProgramInteractions
        }
      },
      detailedSamples: stats.detailedSamples
    };
    
    // Print summary
    console.log('\n======= ANALYSIS OF UNKNOWN TRANSACTIONS =======');
    console.log(`Total unknown transactions analyzed: ${report.totalUnknownTransactions}`);
    
    console.log('\nTransaction Type Breakdown:');
    Object.entries(report.transactionTypeBreakdown).forEach(([type, count]) => {
      const percentage = (count / report.totalUnknownTransactions) * 100;
      console.log(`  ${type}: ${count} (${percentage.toFixed(2)}%)`);
    });
    
    console.log('\nTop Programs Used:');
    report.programFrequency.forEach(program => {
      console.log(`  ${program.name} (${program.programId}): ${program.count} (${program.percentage.toFixed(2)}%)`);
    });
    
    console.log('\nKey Characteristics:');
    console.log(`  DEX Interactions: ${report.characteristics.dexInteractions.count} (${report.characteristics.dexInteractions.percentage.toFixed(2)}%)`);
    console.log(`  Token Balance Changes: ${report.characteristics.tokenBalanceChanges.count} (${report.characteristics.tokenBalanceChanges.percentage.toFixed(2)}%)`);
    console.log(`  Token Program Interactions: ${report.characteristics.tokenProgramInteractions.count} (${report.characteristics.tokenProgramInteractions.percentage.toFixed(2)}%)`);
    
    // Print sample for each transaction type
    console.log('\nSample Transactions by Type:');
    Object.entries(report.detailedSamples).forEach(([type, sample]) => {
      console.log(`\n${type.toUpperCase()} TRANSACTION EXAMPLE:`);
      console.log(`  Signature: ${sample.signature}`);
      console.log('  Programs Used:');
      sample.programIds.forEach(program => {
        console.log(`    - ${program.name} (${program.id})`);
      });
      
      if (sample.tokenBalanceChanges.length > 0) {
        console.log('  Token Balance Changes:');
        sample.tokenBalanceChanges.forEach(change => {
          console.log(`    - Wallet ${change.owner}: ${change.preBal} → ${change.postBal} (${change.change > 0 ? '+' : ''}${change.change})`);
        });
      } else {
        console.log('  No token balance changes for our token');
      }
    });
    
    // Save full report to file
    fs.writeFileSync(
      'unknown_transactions_analysis.json', 
      JSON.stringify(report, null, 2)
    );
    console.log('\nFull analysis saved to unknown_transactions_analysis.json');
    
    // Generate parser improvement recommendations
    console.log('\n======= PARSER IMPROVEMENT RECOMMENDATIONS =======');
    
    // Check if we have DEX interactions
    if (report.characteristics.dexInteractions.percentage > 10) {
      console.log('1. Add support for DEX program detection:');
      const dexPrograms = report.programFrequency
        .filter(p => hasDexInteraction([p.programId]))
        .map(p => `   - ${p.name} (${p.programId})`);
      
      if (dexPrograms.length > 0) {
        console.log(dexPrograms.join('\n'));
      }
    }
    
    // Check if we have token operations
    if (report.transactionTypeBreakdown.token_operation > 0) {
      console.log('\n2. Improve token operation classification:');
      console.log('   - Add logic to detect token approvals and revocations');
      console.log('   - Add logic to detect token account creations');
    }
    
    // Check if we have administrative operations
    if (report.transactionTypeBreakdown.administrative > 0) {
      console.log('\n3. Add support for administrative operations:');
      console.log('   - Account creations');
      console.log('   - Metadata updates');
      console.log('   - Authority changes');
    }
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main();
