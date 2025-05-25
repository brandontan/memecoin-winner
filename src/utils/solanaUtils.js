const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');

// Configure Solana connection
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL);

// Known rug tokens for demo purposes
const KNOWN_RUG_CREATORS = [
  'Rug4zT1SrsRv9Fvtmz4fR5X38FJjMKgdKzw2zGX5XN2',
  'RugPu11erDZUE9WCVMjS3qYTbEKxz9VuLgT4rjJhDv9',
  // Add more known ruggers as identified
];

/**
 * Get the age of a wallet in days
 * @param {string} creatorAddress - Solana wallet address
 * @returns {Promise<number>} - Age in days
 */
async function getWalletAge(creatorAddress) {
  try {
    // Convert address to PublicKey
    const pubKey = new PublicKey(creatorAddress);
    
    // Get the oldest transaction for this account
    const signatures = await connection.getSignaturesForAddress(
      pubKey,
      { limit: 1 },
      'finalized'
    );
    
    if (signatures.length === 0) {
      return 0; // No transactions found
    }
    
    // Get the oldest transaction
    const oldestTx = await connection.getTransaction(signatures[signatures.length - 1].signature);
    
    if (!oldestTx || !oldestTx.blockTime) {
      return 30; // Default to 30 days if we can't determine
    }
    
    // Calculate age in days
    const txTimestamp = oldestTx.blockTime * 1000; // Convert to milliseconds
    const ageInDays = Math.floor((Date.now() - txTimestamp) / (1000 * 60 * 60 * 24));
    
    return ageInDays;
  } catch (error) {
    console.error('Error getting wallet age:', error);
    return 30; // Default to 30 days on error
  }
}

/**
 * Get tokens created by this wallet
 * @param {string} creatorAddress - Solana wallet address
 * @returns {Promise<Object>} - Previous tokens info
 */
async function getPreviousTokensCreated(creatorAddress) {
  try {
    // This would typically query a token indexer or Solana program
    // For demo, we'll simulate with a placeholder implementation
    
    // Convert address to PublicKey
    const pubKey = new PublicKey(creatorAddress);
    
    // Get recent transactions
    const signatures = await connection.getSignaturesForAddress(
      pubKey,
      { limit: 20 },
      'finalized'
    );
    
    // Analyze transactions to find token creations
    // This is a simplified approach - real implementation would be more complex
    let tokenCount = Math.min(signatures.length / 5, 3); // Rough estimate
    let successfulTokens = Math.floor(tokenCount * 0.7); // Assume 70% success rate
    
    return {
      length: tokenCount,
      successful: successfulTokens,
      tokens: [] // Would contain actual token addresses in real implementation
    };
  } catch (error) {
    console.error('Error getting previous tokens:', error);
    return { length: 0, successful: 0, tokens: [] };
  }
}

/**
 * Check if wallet has history of rug pulls
 * @param {string} creatorAddress - Solana wallet address
 * @returns {Promise<Array>} - List of rug pull incidents
 */
async function checkRugPullHistory(creatorAddress) {
  try {
    // Check against known rug creators
    if (KNOWN_RUG_CREATORS.includes(creatorAddress)) {
      return [{ token: 'UNKNOWN', date: new Date() }];
    }
    
    // In a real implementation, we would:
    // 1. Check for liquidity removal patterns
    // 2. Analyze token price charts for sudden drops
    // 3. Check community reports and blacklists
    
    // For now, we'll use a simple heuristic based on transaction patterns
    const pubKey = new PublicKey(creatorAddress);
    const signatures = await connection.getSignaturesForAddress(
      pubKey,
      { limit: 50 },
      'finalized'
    );
    
    // This is a placeholder for actual analysis
    // Real implementation would look for specific transaction patterns
    
    // For demo, we'll return empty array (no rug history)
    return [];
  } catch (error) {
    console.error('Error checking rug history:', error);
    return [];
  }
}

/**
 * Comprehensive creator analysis
 * @param {string} creatorAddress - Solana wallet address
 * @returns {Promise<Object>} - Creator assessment
 */
async function analyzeCreator(creatorAddress) {
  try {
    // Check creator wallet history
    const walletAge = await getWalletAge(creatorAddress);
    const previousTokens = await getPreviousTokensCreated(creatorAddress);
    const rugHistory = await checkRugPullHistory(creatorAddress);
    
    // Calculate real creator score
    if (rugHistory.length > 0) {
      return { 
        emoji: '💀', 
        text: 'Rugger', 
        class: 'score-below70',
        details: {
          walletAge,
          previousTokens: previousTokens.length,
          rugIncidents: rugHistory.length
        }
      };
    }
    
    if (previousTokens.length === 0 && walletAge < 30) {
      return { 
        emoji: '🆕', 
        text: 'New', 
        class: 'score-70plus',
        details: {
          walletAge,
          previousTokens: previousTokens.length,
          rugIncidents: 0
        }
      };
    }
    
    if (previousTokens.successful > 2) {
      return { 
        emoji: '💎', 
        text: 'Diamond', 
        class: 'score-90plus',
        details: {
          walletAge,
          previousTokens: previousTokens.length,
          successfulTokens: previousTokens.successful,
          rugIncidents: 0
        }
      };
    }
    
    if (previousTokens.length > 0) {
      return { 
        emoji: '⭐', 
        text: 'Proven', 
        class: 'score-80plus',
        details: {
          walletAge,
          previousTokens: previousTokens.length,
          successfulTokens: previousTokens.successful,
          rugIncidents: 0
        }
      };
    }
    
    // Default case
    return { 
      emoji: '🆕', 
      text: 'New', 
      class: 'score-70plus',
      details: {
        walletAge,
        previousTokens: 0,
        rugIncidents: 0
      }
    };
  } catch (error) {
    console.error('Error analyzing creator:', error);
    // Fallback in case of error
    return { 
      emoji: '❓', 
      text: 'Unknown', 
      class: 'score-below70',
      details: {
        error: error.message
      }
    };
  }
}

module.exports = {
  getWalletAge,
  getPreviousTokensCreated,
  checkRugPullHistory,
  analyzeCreator
};
