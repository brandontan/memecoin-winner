/**
 * Enhanced Transaction Parser for Solana Transactions
 * Adds support for Phoenix DEX and other complex transaction patterns
 */

const PROGRAM_IDS = {
  SYSTEM_PROGRAM: '11111111111111111111111111111111',
  TOKEN_PROGRAM: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ASSOCIATED_TOKEN_PROGRAM: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  
  // DEX Programs
  JUPITER_AGGREGATOR: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  RAYDIUM: 'RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr',
  RAYDIUM_LIQUIDITY: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  PHOENIX_DEX: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  SERUM_V3: 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',
  SERUM_V3_OLD: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
  
  // Other Common Programs
  MEMO_PROGRAM: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  METAPLEX_METADATA: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
  COMPUTE_BUDGET: 'ComputeBudget111111111111111111111111111111'
};

// Transaction types
const TRANSACTION_TYPES = {
  BUY: 'buy',
  SELL: 'sell',
  TRANSFER: 'transfer',
  LIQUIDITY_ADD: 'liquidity_add',
  LIQUIDITY_REMOVE: 'liquidity_remove',
  MINT: 'mint',
  BURN: 'burn',
  UNKNOWN: 'unknown'
};

/**
 * Extract all instructions (including inner instructions) from a transaction
 * @param {Object} transaction - Solana transaction data
 * @returns {Array} Array of all instructions with metadata
 */
function extractAllInstructions(transaction) {
  const instructions = [];
  
  // Add main instructions
  if (transaction.transaction?.message?.instructions) {
    instructions.push(...transaction.transaction.message.instructions.map(ix => ({
      ...ix,
      isInner: false,
      parentIndex: null
    })));
  }
  
  // Add inner instructions
  if (transaction.meta?.innerInstructions) {
    for (const innerInstructionSet of transaction.meta.innerInstructions) {
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

/**
 * Extract program IDs used in a transaction
 * @param {Object} transaction - Solana transaction data
 * @returns {Array} Array of program IDs
 */
function extractProgramIds(transaction) {
  const programIds = new Set();
  
  // Extract from main instructions
  if (transaction.transaction?.message?.instructions) {
    transaction.transaction.message.instructions.forEach(ix => {
      if (ix.programId) {
        programIds.add(ix.programId.toString());
      }
    });
  }
  
  // Extract from inner instructions
  if (transaction.meta?.innerInstructions) {
    transaction.meta.innerInstructions.forEach(innerSet => {
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

/**
 * Analyze token balance changes in a transaction
 * @param {Object} transaction - Solana transaction data
 * @param {String} tokenAddress - Token mint address to analyze
 * @returns {Object} Analysis of token balance changes
 */
function analyzeTokenBalances(transaction, tokenAddress) {
  const preBalances = transaction.meta?.preTokenBalances || [];
  const postBalances = transaction.meta?.postTokenBalances || [];
  
  // Filter for our token
  const preTokenBalances = preBalances.filter(b => b.mint === tokenAddress);
  const postTokenBalances = postBalances.filter(b => b.mint === tokenAddress);
  
  // Create maps for easier lookup
  const preBalanceMap = new Map();
  const postBalanceMap = new Map();
  
  preTokenBalances.forEach(balance => {
    preBalanceMap.set(balance.owner, {
      amount: balance.uiTokenAmount.amount,
      uiAmount: balance.uiTokenAmount.uiAmount || 0,
      accountIndex: balance.accountIndex
    });
  });
  
  postTokenBalances.forEach(balance => {
    postBalanceMap.set(balance.owner, {
      amount: balance.uiTokenAmount.amount,
      uiAmount: balance.uiTokenAmount.uiAmount || 0,
      accountIndex: balance.accountIndex
    });
  });
  
  // Calculate changes
  const changes = [];
  
  // Combine all owners
  const allOwners = new Set([...preBalanceMap.keys(), ...postBalanceMap.keys()]);
  
  allOwners.forEach(owner => {
    const preBal = preBalanceMap.get(owner)?.amount || '0';
    const postBal = postBalanceMap.get(owner)?.amount || '0';
    const preBalNum = BigInt(preBal);
    const postBalNum = BigInt(postBal);
    
    if (preBalNum !== postBalNum) {
      changes.push({
        owner,
        preBal: preBalNum,
        postBal: postBalNum,
        change: postBalNum - preBalNum,
        uiPreBal: preBalanceMap.get(owner)?.uiAmount || 0,
        uiPostBal: postBalanceMap.get(owner)?.uiAmount || 0,
        uiChange: (postBalanceMap.get(owner)?.uiAmount || 0) - (preBalanceMap.get(owner)?.uiAmount || 0)
      });
    }
  });
  
  return {
    preTokenBalances,
    postTokenBalances,
    changes
  };
}

/**
 * Check if a transaction is a DEX interaction
 * @param {Array} programIds - Array of program IDs in the transaction
 * @returns {Boolean} True if transaction involves a DEX
 */
function isDexInteraction(programIds) {
  const dexProgramIds = [
    PROGRAM_IDS.JUPITER_AGGREGATOR,
    PROGRAM_IDS.JUPITER_V6,
    PROGRAM_IDS.ORCA_WHIRLPOOL,
    PROGRAM_IDS.RAYDIUM,
    PROGRAM_IDS.RAYDIUM_LIQUIDITY,
    PROGRAM_IDS.PHOENIX_DEX,
    PROGRAM_IDS.SERUM_V3,
    PROGRAM_IDS.SERUM_V3_OLD
  ];
  
  return programIds.some(id => dexProgramIds.includes(id));
}

/**
 * Determine if a transaction is a Phoenix DEX trade
 * @param {Object} transaction - Solana transaction data
 * @param {String} tokenAddress - Token mint address
 * @returns {Object|null} Trade details if it's a Phoenix trade, null otherwise
 */
function detectPhoenixDexTrade(transaction, tokenAddress) {
  const programIds = extractProgramIds(transaction);
  
  // Check if Phoenix DEX is involved
  if (!programIds.includes(PROGRAM_IDS.PHOENIX_DEX)) {
    return null;
  }
  
  // Analyze token balances
  const tokenBalances = analyzeTokenBalances(transaction, tokenAddress);
  const instructions = extractAllInstructions(transaction);
  
  // Get token transfers
  const tokenTransfers = instructions.filter(ix => 
    ix.programId?.toString() === PROGRAM_IDS.TOKEN_PROGRAM &&
    ix.parsed?.type === 'transfer'
  );
  
  // If no token transfers, it's not a trade
  if (tokenTransfers.length === 0) {
    return null;
  }
  
  // Check for Phoenix DEX pattern
  // In Phoenix, typically there are token transfers to/from the DEX
  let isBuy = false;
  let isSell = false;
  let amount = 0;
  
  // Look for token transfers where our token is involved
  const relevantTransfers = tokenTransfers.filter(ix => 
    ix.parsed?.info?.source?.includes(tokenAddress) ||
    ix.parsed?.info?.destination?.includes(tokenAddress)
  );
  
  if (relevantTransfers.length > 0) {
    // If our token is being transferred, check the direction
    const userWallets = new Set(tokenBalances.changes.map(c => c.owner));
    
    for (const transfer of relevantTransfers) {
      const source = transfer.parsed?.info?.source;
      const destination = transfer.parsed?.info?.destination;
      const transferAmount = BigInt(transfer.parsed?.info?.amount || '0');
      
      // If transferring from a user wallet to a DEX account, it's a sell
      if (userWallets.has(source) && !userWallets.has(destination)) {
        isSell = true;
        amount = transferAmount;
      }
      
      // If transferring from a DEX account to a user wallet, it's a buy
      if (!userWallets.has(source) && userWallets.has(destination)) {
        isBuy = true;
        amount = transferAmount;
      }
    }
  } else {
    // If no direct transfers of our token, check token balance changes
    if (tokenBalances.changes.length > 0) {
      // Find wallets with increased balances (buys) or decreased balances (sells)
      const increases = tokenBalances.changes.filter(c => c.change > 0);
      const decreases = tokenBalances.changes.filter(c => c.change < 0);
      
      if (increases.length > 0) {
        isBuy = true;
        amount = increases.reduce((sum, c) => sum + c.change, BigInt(0));
      }
      
      if (decreases.length > 0) {
        isSell = true;
        amount = decreases.reduce((sum, c) => sum + (c.change * BigInt(-1)), BigInt(0));
      }
    }
  }
  
  // Determine the transaction type
  let transactionType = TRANSACTION_TYPES.UNKNOWN;
  
  if (isBuy && !isSell) {
    transactionType = TRANSACTION_TYPES.BUY;
  } else if (isSell && !isBuy) {
    transactionType = TRANSACTION_TYPES.SELL;
  } else if (isBuy && isSell) {
    // If both buy and sell, it might be a swap or liquidity operation
    // For now, we'll classify it as a transfer
    transactionType = TRANSACTION_TYPES.TRANSFER;
  }
  
  return {
    transactionType,
    amount: amount.toString(),
    dex: 'Phoenix',
    programId: PROGRAM_IDS.PHOENIX_DEX
  };
}

/**
 * Parse a Solana transaction to extract token transaction details
 * @param {Object} transaction - Solana transaction data
 * @param {String} tokenAddress - Token mint address
 * @returns {Object} Parsed transaction details
 */
function parseTransaction(transaction, tokenAddress) {
  // Initialize result with default values
  const result = {
    transactionType: TRANSACTION_TYPES.UNKNOWN,
    fromWallet: null,
    toWallet: null,
    amount: '0',
    isLiquidityOperation: false,
    liquidityChangeAmount: '0'
  };
  
  // Extract program IDs
  const programIds = extractProgramIds(transaction);
  
  // Check for Phoenix DEX trade
  const phoenixTrade = detectPhoenixDexTrade(transaction, tokenAddress);
  if (phoenixTrade) {
    result.transactionType = phoenixTrade.transactionType;
    result.amount = phoenixTrade.amount;
    
    // Analyze token balances to find from/to wallets
    const tokenBalances = analyzeTokenBalances(transaction, tokenAddress);
    
    if (phoenixTrade.transactionType === TRANSACTION_TYPES.BUY) {
      // For buys, the receiver is the wallet with increased balance
      const receivers = tokenBalances.changes.filter(c => c.change > 0);
      if (receivers.length > 0) {
        result.toWallet = receivers[0].owner;
      }
    } else if (phoenixTrade.transactionType === TRANSACTION_TYPES.SELL) {
      // For sells, the sender is the wallet with decreased balance
      const senders = tokenBalances.changes.filter(c => c.change < 0);
      if (senders.length > 0) {
        result.fromWallet = senders[0].owner;
      }
    }
    
    return result;
  }
  
  // Check for other DEX interactions
  if (isDexInteraction(programIds)) {
    // Analyze token balances
    const tokenBalances = analyzeTokenBalances(transaction, tokenAddress);
    
    if (tokenBalances.changes.length > 0) {
      // Find wallets with increased balances (buys) or decreased balances (sells)
      const increases = tokenBalances.changes.filter(c => c.change > 0);
      const decreases = tokenBalances.changes.filter(c => c.change < 0);
      
      if (increases.length > 0 && decreases.length === 0) {
        result.transactionType = TRANSACTION_TYPES.BUY;
        result.amount = increases.reduce((sum, c) => sum + c.change, BigInt(0)).toString();
        result.toWallet = increases[0].owner;
      } else if (decreases.length > 0 && increases.length === 0) {
        result.transactionType = TRANSACTION_TYPES.SELL;
        result.amount = decreases.reduce((sum, c) => sum + (c.change * BigInt(-1)), BigInt(0)).toString();
        result.fromWallet = decreases[0].owner;
      } else if (increases.length > 0 && decreases.length > 0) {
        // If both increases and decreases, it's likely a transfer or liquidity operation
        
        // Check for liquidity operations
        if (programIds.includes(PROGRAM_IDS.RAYDIUM_LIQUIDITY)) {
          result.isLiquidityOperation = true;
          
          // Determine if adding or removing liquidity
          const netChange = tokenBalances.changes.reduce((sum, c) => sum + c.change, BigInt(0));
          
          if (netChange > 0) {
            result.transactionType = TRANSACTION_TYPES.LIQUIDITY_ADD;
          } else {
            result.transactionType = TRANSACTION_TYPES.LIQUIDITY_REMOVE;
          }
          
          result.liquidityChangeAmount = netChange.toString();
        } else {
          // If not a liquidity operation, it's a transfer
          result.transactionType = TRANSACTION_TYPES.TRANSFER;
          result.fromWallet = decreases[0].owner;
          result.toWallet = increases[0].owner;
          result.amount = decreases.reduce((sum, c) => sum + (c.change * BigInt(-1)), BigInt(0)).toString();
        }
      }
    }
    
    return result;
  }
  
  // Check for simple transfers
  const instructions = extractAllInstructions(transaction);
  const tokenTransfers = instructions.filter(ix => 
    ix.programId?.toString() === PROGRAM_IDS.TOKEN_PROGRAM &&
    ix.parsed?.type === 'transfer'
  );
  
  if (tokenTransfers.length > 0) {
    // Analyze token balances
    const tokenBalances = analyzeTokenBalances(transaction, tokenAddress);
    
    if (tokenBalances.changes.length >= 2) {
      // Find wallets with increased and decreased balances
      const increases = tokenBalances.changes.filter(c => c.change > 0);
      const decreases = tokenBalances.changes.filter(c => c.change < 0);
      
      if (increases.length > 0 && decreases.length > 0) {
        result.transactionType = TRANSACTION_TYPES.TRANSFER;
        result.fromWallet = decreases[0].owner;
        result.toWallet = increases[0].owner;
        result.amount = decreases.reduce((sum, c) => sum + (c.change * BigInt(-1)), BigInt(0)).toString();
      }
    }
  }
  
  return result;
}

module.exports = {
  parseTransaction,
  PROGRAM_IDS,
  TRANSACTION_TYPES,
  isDexInteraction,
  analyzeTokenBalances,
  extractAllInstructions,
  extractProgramIds
};
