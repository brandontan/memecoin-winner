const { PublicKey } = require('@solana/web3.js');

// Known program IDs for DEXes and token operations
const PROGRAM_IDS = {
  // System programs
  SYSTEM_PROGRAM: '11111111111111111111111111111111',
  TOKEN_PROGRAM: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ASSOCIATED_TOKEN_PROGRAM: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  
  // DEX programs
  RAYDIUM_AMM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_LIQUIDITY_POOL: 'RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr',
  RAYDIUM_LIQUIDITY_POOL_V3: '27haf8L6oxUeXrHrgEgsexjSY5hbVUWEmvv9Nyxg8vQv',
  ORCA_SWAP: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
  JUPITER_AGGREGATOR: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  
  // Common stable coins and SOL wrapped token
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  WRAPPED_SOL: 'So11111111111111111111111111111111111111112'
};

// Common instruction types for token program
const TOKEN_INSTRUCTION_TYPES = {
  TRANSFER: 3,           // Transfer tokens
  APPROVE: 4,            // Approve token delegation
  MINT_TO: 7,            // Mint new tokens
  BURN: 8,               // Burn tokens
  CLOSE_ACCOUNT: 9,      // Close token account
  TRANSFER_CHECKED: 12,  // Transfer with amount check
  APPROVE_CHECKED: 13    // Approve with amount check
};

/**
 * Parse a Solana transaction to extract token transaction details
 * @param {Object} txData - Transaction data from Solana RPC
 * @param {Object} sigData - Signature data with metadata
 * @param {string} tokenAddress - The token's mint address
 * @returns {Object} - Parsed transaction data
 */
function parseTransaction(txData, sigData, tokenAddress) {
  // Initialize transaction data with basic info
  const transactionData = {
    signature: sigData.signature,
    tokenAddress,
    blockTime: sigData.blockTime,
    timestamp: new Date(sigData.blockTime * 1000),
    slot: txData.slot,
    processed: true,
    involvedWallets: [],
    processingErrors: []
  };
  
  try {
    // Extract account keys (wallets involved)
    if (txData.transaction && txData.transaction.message) {
      const accountKeys = txData.transaction.message.accountKeys || [];
      transactionData.involvedWallets = accountKeys.map(key => key.pubkey.toString());
    }
    
    // Get all instructions (including inner instructions)
    const instructions = extractAllInstructions(txData);
    
    // Check token balances before and after
    const preTokenBalances = txData.meta?.preTokenBalances || [];
    const postTokenBalances = txData.meta?.postTokenBalances || [];
    
    // Analyze token balance changes
    const tokenBalanceChanges = analyzeTokenBalances(preTokenBalances, postTokenBalances, tokenAddress);
    
    // Detect transaction type and extract details
    const txDetails = detectTransactionType(
      instructions, 
      tokenBalanceChanges, 
      tokenAddress,
      transactionData.involvedWallets
    );
    
    // Update transaction data with detected details
    transactionData.transactionType = txDetails.type;
    transactionData.fromWallet = txDetails.fromWallet;
    transactionData.toWallet = txDetails.toWallet;
    transactionData.amount = txDetails.amount;
    transactionData.isLiquidityOperation = txDetails.isLiquidityOperation;
    transactionData.liquidityChangeAmount = txDetails.liquidityChangeAmount;
    
    // Add additional context if available
    if (txDetails.context) {
      transactionData.context = txDetails.context;
    }
    
  } catch (error) {
    console.warn(`Error parsing transaction ${sigData.signature}:`, error.message);
    transactionData.processingErrors.push(error.message);
    transactionData.processed = false;
    transactionData.transactionType = 'unknown';
  }
  
  return transactionData;
}

/**
 * Extract all instructions from a transaction (including inner instructions)
 * @param {Object} txData - Transaction data
 * @returns {Array} - All instructions
 */
function extractAllInstructions(txData) {
  const instructions = [];
  
  // Add main instructions
  if (txData.transaction?.message?.instructions) {
    instructions.push(...txData.transaction.message.instructions);
  }
  
  // Add inner instructions
  if (txData.meta?.innerInstructions) {
    for (const innerInstructionSet of txData.meta.innerInstructions) {
      if (innerInstructionSet.instructions) {
        instructions.push(...innerInstructionSet.instructions);
      }
    }
  }
  
  return instructions;
}

/**
 * Analyze token balances to determine transaction type and details
 * @param {Array} preBalances - Token balances before transaction
 * @param {Array} postBalances - Token balances after transaction
 * @param {string} tokenAddress - The token's mint address
 * @returns {Object} - Token balance changes
 */
function analyzeTokenBalances(preBalances, postBalances, tokenAddress) {
  const result = {
    changes: [],
    netChange: 0,
    largestSender: null,
    largestReceiver: null
  };
  
  // Create maps for easier lookup
  const preBalanceMap = new Map();
  const postBalanceMap = new Map();
  
  // Filter for our token and map by owner
  preBalances.forEach(balance => {
    if (balance.mint === tokenAddress) {
      preBalanceMap.set(balance.owner, {
        amount: balance.uiTokenAmount.uiAmount || 0,
        accountIndex: balance.accountIndex
      });
    }
  });
  
  postBalances.forEach(balance => {
    if (balance.mint === tokenAddress) {
      postBalanceMap.set(balance.owner, {
        amount: balance.uiTokenAmount.uiAmount || 0,
        accountIndex: balance.accountIndex
      });
    }
  });
  
  // Find all wallets involved with this token
  const allWallets = new Set([
    ...preBalanceMap.keys(),
    ...postBalanceMap.keys()
  ]);
  
  // Calculate changes for each wallet
  let maxDecrease = 0;
  let maxIncrease = 0;
  
  allWallets.forEach(wallet => {
    const preBal = preBalanceMap.get(wallet)?.amount || 0;
    const postBal = postBalanceMap.get(wallet)?.amount || 0;
    const change = postBal - preBal;
    
    if (change !== 0) {
      result.changes.push({
        wallet,
        preBalance: preBal,
        postBalance: postBal,
        change
      });
      
      result.netChange += change;
      
      // Track largest sender and receiver
      if (change < 0 && change < maxDecrease) {
        maxDecrease = change;
        result.largestSender = {
          wallet,
          amount: Math.abs(change)
        };
      } else if (change > 0 && change > maxIncrease) {
        maxIncrease = change;
        result.largestReceiver = {
          wallet,
          amount: change
        };
      }
    }
  });
  
  return result;
}

/**
 * Detect transaction type and extract details
 * @param {Array} instructions - All transaction instructions
 * @param {Object} balanceChanges - Token balance changes
 * @param {string} tokenAddress - The token's mint address
 * @param {Array} involvedWallets - All wallets involved in the transaction
 * @returns {Object} - Transaction type and details
 */
function detectTransactionType(instructions, balanceChanges, tokenAddress, involvedWallets) {
  const result = {
    type: 'unknown',
    fromWallet: null,
    toWallet: null,
    amount: 0,
    isLiquidityOperation: false,
    liquidityChangeAmount: 0,
    context: {}
  };
  
  // Check if this is a DEX transaction (swap)
  const isDexTransaction = instructions.some(ix => 
    Object.values(PROGRAM_IDS).includes(ix.programId?.toString()) &&
    ix.programId?.toString() !== PROGRAM_IDS.TOKEN_PROGRAM &&
    ix.programId?.toString() !== PROGRAM_IDS.SYSTEM_PROGRAM &&
    ix.programId?.toString() !== PROGRAM_IDS.ASSOCIATED_TOKEN_PROGRAM
  );
  
  // Check if this is a liquidity operation
  const isLiquidityOp = instructions.some(ix => 
    ix.programId?.toString() === PROGRAM_IDS.RAYDIUM_LIQUIDITY_POOL ||
    ix.programId?.toString() === PROGRAM_IDS.RAYDIUM_LIQUIDITY_POOL_V3 ||
    ix.programId?.toString() === PROGRAM_IDS.RAYDIUM_AMM
  );
  
  // Check for token program instructions related to our token
  const tokenInstructions = instructions.filter(ix => 
    ix.programId?.toString() === PROGRAM_IDS.TOKEN_PROGRAM
  );
  
  // If we have balance changes, use them to determine transaction type
  if (balanceChanges.changes.length > 0) {
    // Set amount to the absolute value of the largest change
    if (balanceChanges.largestSender) {
      result.amount = balanceChanges.largestSender.amount;
      result.fromWallet = balanceChanges.largestSender.wallet;
    }
    
    if (balanceChanges.largestReceiver) {
      result.toWallet = balanceChanges.largestReceiver.wallet;
      // If we don't have an amount from sender, use receiver amount
      if (!result.amount) {
        result.amount = balanceChanges.largestReceiver.amount;
      }
    }
    
    // Determine transaction type based on balance changes and instructions
    if (isLiquidityOp) {
      result.isLiquidityOperation = true;
      
      // Determine if it's add or remove based on token balance change
      if (balanceChanges.netChange < 0) {
        result.type = 'liquidity_add';
        result.liquidityChangeAmount = Math.abs(balanceChanges.netChange);
      } else {
        result.type = 'liquidity_remove';
        result.liquidityChangeAmount = balanceChanges.netChange;
      }
    } else if (isDexTransaction) {
      // This is a swap transaction (buy or sell)
      if (balanceChanges.netChange > 0) {
        // Net increase in token supply in wallets = buy
        result.type = 'buy';
      } else if (balanceChanges.netChange < 0) {
        // Net decrease in token supply in wallets = sell
        result.type = 'sell';
      }
    } else if (tokenInstructions.length > 0) {
      // This is likely a transfer between wallets
      result.type = 'transfer';
    }
  } else {
    // No balance changes for our token, but we have token instructions
    // This could be a token approval or other operation
    if (tokenInstructions.length > 0) {
      // Check instruction types
      const hasTransferInstruction = tokenInstructions.some(ix => 
        ix.parsed?.type === 'transfer' || 
        ix.parsed?.type === 'transferChecked'
      );
      
      if (hasTransferInstruction) {
        result.type = 'transfer';
        
        // Try to extract amount and wallets from instruction data
        for (const ix of tokenInstructions) {
          if (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked') {
            if (ix.parsed.info) {
              result.amount = parseFloat(ix.parsed.info.amount) || 0;
              result.fromWallet = ix.parsed.info.source;
              result.toWallet = ix.parsed.info.destination;
              break;
            }
          }
        }
      }
    }
  }
  
  // Add context about the transaction
  result.context = {
    hasDexInteraction: isDexTransaction,
    hasLiquidityPoolInteraction: isLiquidityOp,
    tokenInstructionCount: tokenInstructions.length,
    totalInstructionCount: instructions.length
  };
  
  return result;
}

/**
 * Reprocess existing transactions with improved parsing logic
 * @param {Array} transactions - Existing transaction records
 * @param {Object} connection - Solana connection
 * @returns {Promise<Array>} - Updated transactions
 */
async function reprocessTransactions(transactions, connection) {
  const updatedTransactions = [];
  const stats = {
    total: transactions.length,
    updated: 0,
    byType: {}
  };
  
  for (const tx of transactions) {
    try {
      // Get the full transaction data
      const txData = await connection.getParsedTransaction(
        tx.signature,
        { maxSupportedTransactionVersion: 0 }
      );
      
      if (!txData) {
        console.warn(`No data found for transaction: ${tx.signature}`);
        updatedTransactions.push(tx);
        continue;
      }
      
      // Create signature data object
      const sigData = {
        signature: tx.signature,
        blockTime: tx.blockTime
      };
      
      // Parse transaction with improved logic
      const updatedTx = parseTransaction(txData, sigData, tx.tokenAddress);
      
      // Update stats
      stats.updated++;
      stats.byType[updatedTx.transactionType] = (stats.byType[updatedTx.transactionType] || 0) + 1;
      
      updatedTransactions.push(updatedTx);
    } catch (error) {
      console.error(`Error reprocessing transaction ${tx.signature}:`, error);
      updatedTransactions.push(tx);
    }
  }
  
  return { updatedTransactions, stats };
}

module.exports = {
  parseTransaction,
  reprocessTransactions,
  PROGRAM_IDS
};
