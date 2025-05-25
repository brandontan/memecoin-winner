const mongoose = require('mongoose');
const { Connection, PublicKey } = require('@solana/web3.js');
const Transaction = require('../src/models/transaction');
const fs = require('fs');

// Connect to MongoDB
const MONGODB_URI = 'mongodb://localhost:27017/memecoin';

// Token to analyze
const TOKEN_ADDRESS = '3e68JicuTepVb2p7p6ajHyB3FembdXfp7UF35RufHK37';

// Configure Solana connection with rate limiting
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

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

// Helper function to get program name
function getProgramName(programId) {
  return KNOWN_PROGRAMS[programId] || 'Unknown Program';
}

// Helper function to extract program IDs from transaction data
function extractProgramIds(txData) {
  const programIds = new Set();
  
  // Extract from account keys
  if (txData.transaction?.message?.accountKeys) {
    txData.transaction.message.accountKeys.forEach(key => {
      programIds.add(key.pubkey.toString());
    });
  }
  
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
}

// Helper function to analyze token balance changes
function analyzeTokenBalances(txData, tokenAddress) {
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
}

// Helper function to extract all instructions
function extractAllInstructions(txData) {
  const instructions = [];
  
  // Add main instructions
  if (txData.transaction?.message?.instructions) {
    instructions.push(...txData.transaction.message.instructions.map(ix => ({
      ...ix,
      isInner: false
    })));
  }
  
  // Add inner instructions
  if (txData.meta?.innerInstructions) {
    for (const innerInstructionSet of txData.meta.innerInstructions) {
      if (innerInstructionSet.instructions) {
        instructions.push(...innerInstructionSet.instructions.map(ix => ({
          ...ix,
          isInner: true,
          parentIndex: innerInstructionSet.index
        })));
      }
    }
  }
  
  return instructions;
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
function determineTransactionType(programIds, tokenBalanceChanges, instructions) {
  // Check for DEX interactions
  const isDexInteraction = hasDexInteraction(programIds);
  
  // Check for token balance changes
  const hasTokenBalanceChanges = tokenBalanceChanges.changes.length > 0;
  
  // Check for token program instructions
  const tokenProgramInstructions = instructions.filter(ix => 
    ix.programId?.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  );
  
  const tokenInstructionTypes = tokenProgramInstructions
    .filter(ix => ix.parsed?.type)
    .map(ix => ix.parsed.type);
  
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
  
  // Check for specific token program instructions
  if (tokenInstructionTypes.includes('transfer')) {
    return 'transfer';
  } else if (tokenInstructionTypes.includes('approve')) {
    return 'approval';
  } else if (tokenInstructionTypes.includes('mintTo')) {
    return 'mint';
  } else if (tokenInstructionTypes.includes('burn')) {
    return 'burn';
  } else if (tokenInstructionTypes.includes('closeAccount')) {
    return 'close_account';
  }
  
  // Check if it's just a token program interaction
  if (tokenProgramInstructions.length > 0) {
    return 'token_operation';
  }
  
  // Check for account creation
  const hasCreateAccountInstruction = instructions.some(ix => 
    ix.programId?.toString() === '11111111111111111111111111111111' && 
    ix.parsed?.type === 'createAccount'
  );
  
  if (hasCreateAccountInstruction) {
    return 'account_creation';
  }
  
  return 'administrative';
}

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
        console.log(`Server responded with 429 Too Many Requests. Retrying after ${delay}ms delay...`);
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
    
    // Get unknown transactions
    console.log(`Fetching unknown transactions for token: ${TOKEN_ADDRESS}`);
    const unknownTransactions = await Transaction.find({ 
      tokenAddress: TOKEN_ADDRESS,
      transactionType: 'unknown'
    }).limit(10).lean(); // Limit to 10 to avoid rate limits
    
    console.log(`Found ${unknownTransactions.length} unknown transactions to analyze`);
    
    if (unknownTransactions.length === 0) {
      console.log('No unknown transactions to analyze');
      await mongoose.disconnect();
      return;
    }
    
    // Collect data for analysis
    const transactionData = [];
    
    // Fetch and analyze each transaction
    for (let i = 0; i < unknownTransactions.length; i++) {
      const tx = unknownTransactions[i];
      console.log(`\n[${i+1}/${unknownTransactions.length}] Analyzing transaction: ${tx.signature}`);
      
      try {
        // Fetch transaction data with retry and rate limiting
        const txData = await fetchTransactionWithRetry(tx.signature);
        
        if (!txData) {
          console.log(`No data found for transaction ${tx.signature}`);
          continue;
        }
        
        // Extract program IDs
        const programIds = extractProgramIds(txData);
        
        // Extract all instructions
        const instructions = extractAllInstructions(txData);
        
        // Analyze token balances
        const tokenBalances = analyzeTokenBalances(txData, TOKEN_ADDRESS);
        
        // Determine transaction type
        const txType = determineTransactionType(programIds, tokenBalances, instructions);
        
        // Store data for analysis
        transactionData.push({
          signature: tx.signature,
          timestamp: tx.timestamp,
          programIds: programIds.map(id => ({
            id,
            name: getProgramName(id)
          })),
          tokenBalanceChanges: tokenBalances.changes,
          instructions: instructions.map(ix => ({
            programId: ix.programId?.toString(),
            programName: getProgramName(ix.programId?.toString()),
            isInner: ix.isInner,
            parsed: ix.parsed
          })),
          suggestedType: txType,
          rawData: txData
        });
        
        // Print basic analysis
        console.log(`  Suggested type: ${txType}`);
        console.log(`  Programs used: ${programIds.length}`);
        programIds.slice(0, 3).forEach(id => {
          console.log(`    - ${getProgramName(id)} (${id})`);
        });
        if (programIds.length > 3) {
          console.log(`    - ... and ${programIds.length - 3} more`);
        }
        
        console.log(`  Token balance changes: ${tokenBalances.changes.length}`);
        tokenBalances.changes.forEach(change => {
          console.log(`    - Wallet ${change.owner}: ${change.preBal} → ${change.postBal} (${change.change > 0 ? '+' : ''}${change.change})`);
        });
        
        // Rate limiting - wait between requests
        if (i < unknownTransactions.length - 1) {
          console.log('  Waiting 2 seconds before next request...');
          await sleep(2000);
        }
      } catch (error) {
        console.error(`  Error analyzing transaction ${tx.signature}:`, error.message);
      }
    }
    
    // Analyze the collected data
    console.log('\n======= ANALYSIS OF UNKNOWN TRANSACTIONS =======');
    
    // Count transaction types
    const typeCounts = {};
    transactionData.forEach(tx => {
      typeCounts[tx.suggestedType] = (typeCounts[tx.suggestedType] || 0) + 1;
    });
    
    console.log('\nTransaction Type Breakdown:');
    Object.entries(typeCounts).forEach(([type, count]) => {
      const percentage = (count / transactionData.length) * 100;
      console.log(`  ${type}: ${count} (${percentage.toFixed(2)}%)`);
    });
    
    // Count program usage
    const programCounts = {};
    transactionData.forEach(tx => {
      tx.programIds.forEach(program => {
        programCounts[program.id] = (programCounts[program.id] || 0) + 1;
      });
    });
    
    // Sort programs by frequency
    const sortedPrograms = Object.entries(programCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([programId, count]) => ({
        programId,
        name: getProgramName(programId),
        count,
        percentage: (count / transactionData.length) * 100
      }));
    
    console.log('\nTop Programs Used:');
    sortedPrograms.slice(0, 10).forEach(program => {
      console.log(`  ${program.name} (${program.programId}): ${program.count} (${program.percentage.toFixed(2)}%)`);
    });
    
    // Count DEX interactions
    const dexInteractions = transactionData.filter(tx => 
      hasDexInteraction(tx.programIds.map(p => p.id))
    ).length;
    
    // Count token balance changes
    const withTokenBalanceChanges = transactionData.filter(tx => 
      tx.tokenBalanceChanges.length > 0
    ).length;
    
    // Count token program interactions
    const withTokenProgramInteractions = transactionData.filter(tx => 
      tx.programIds.some(p => p.id === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    ).length;
    
    console.log('\nKey Characteristics:');
    console.log(`  DEX Interactions: ${dexInteractions} (${(dexInteractions / transactionData.length * 100).toFixed(2)}%)`);
    console.log(`  Token Balance Changes: ${withTokenBalanceChanges} (${(withTokenBalanceChanges / transactionData.length * 100).toFixed(2)}%)`);
    console.log(`  Token Program Interactions: ${withTokenProgramInteractions} (${(withTokenProgramInteractions / transactionData.length * 100).toFixed(2)}%)`);
    
    // Print sample for each transaction type
    console.log('\nSample Transactions by Type:');
    Object.keys(typeCounts).forEach(type => {
      const sample = transactionData.find(tx => tx.suggestedType === type);
      if (sample) {
        console.log(`\n${type.toUpperCase()} TRANSACTION EXAMPLE:`);
        console.log(`  Signature: ${sample.signature}`);
        console.log('  Programs Used:');
        sample.programIds.slice(0, 5).forEach(program => {
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
        
        // Show a few instructions
        console.log('  Key Instructions:');
        const keyInstructions = sample.instructions
          .filter(ix => ix.parsed?.type)
          .slice(0, 3);
        
        if (keyInstructions.length > 0) {
          keyInstructions.forEach(ix => {
            console.log(`    - ${ix.isInner ? 'Inner' : 'Outer'} ${ix.programName}: ${ix.parsed?.type || 'Unknown'}`);
            if (ix.parsed?.info) {
              const infoStr = JSON.stringify(ix.parsed.info).substring(0, 100);
              console.log(`      ${infoStr}${infoStr.length >= 100 ? '...' : ''}`);
            }
          });
        } else {
          console.log('    No parsed instructions available');
        }
      }
    });
    
    // Save full data to file
    fs.writeFileSync(
      'unknown_transactions_analysis.json', 
      JSON.stringify({
        transactionData,
        typeCounts,
        programUsage: sortedPrograms,
        characteristics: {
          dexInteractions,
          withTokenBalanceChanges,
          withTokenProgramInteractions
        }
      }, null, 2)
    );
    console.log('\nFull analysis saved to unknown_transactions_analysis.json');
    
    // Generate parser improvement recommendations
    console.log('\n======= PARSER IMPROVEMENT RECOMMENDATIONS =======');
    
    // Check if we have DEX interactions
    if (dexInteractions > 0) {
      console.log('1. Add support for DEX program detection:');
      const dexPrograms = sortedPrograms
        .filter(p => hasDexInteraction([p.programId]))
        .map(p => `   - ${p.name} (${p.programId})`);
      
      if (dexPrograms.length > 0) {
        console.log(dexPrograms.join('\n'));
      }
    }
    
    // Check if we have token operations
    if (typeCounts.token_operation > 0 || typeCounts.approval > 0 || typeCounts.close_account > 0) {
      console.log('\n2. Improve token operation classification:');
      console.log('   - Add logic to detect token approvals and revocations');
      console.log('   - Add logic to detect token account creations and closures');
    }
    
    // Check if we have administrative operations
    if (typeCounts.administrative > 0 || typeCounts.account_creation > 0) {
      console.log('\n3. Add support for administrative operations:');
      console.log('   - Account creations');
      console.log('   - Metadata updates');
      console.log('   - Authority changes');
    }
    
    // Check if we have DEX interactions with our token
    if (dexInteractions > 0 && withTokenBalanceChanges > 0) {
      console.log('\n4. Improve DEX transaction classification:');
      console.log('   - Add logic to detect buys/sells on Phoenix DEX');
      console.log('   - Add support for other DEXes like Jupiter v6');
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
