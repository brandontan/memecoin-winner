/**
 * Scoring service for memecoin potential
 * Provides enhanced scoring algorithms for token evaluation
 */
const { calculateEnhancedScore } = require('../utils/enhancedScoring');
const Transaction = require('../models/transaction');

/**
 * Calculate enhanced score for a token with transaction data
 * @param {Object} token - Token document
 * @returns {Promise<Number>} Enhanced score between 0-100
 */
async function getEnhancedScore(token) {
  if (!token || !token.mintAddress) {
    return 0;
  }
  
  try {
    // Get token transactions
    const transactions = await Transaction.find({ 
      tokenAddress: token.mintAddress 
    }).lean();
    
    // Calculate enhanced score
    return calculateEnhancedScore(token, transactions);
  } catch (error) {
    console.error(`Error calculating enhanced score for ${token.mintAddress}:`, error);
    return token.potentialScore || 0; // Fallback to existing score
  }
}

/**
 * Update a token with its enhanced score
 * @param {Object} token - Token document
 * @returns {Promise<Object>} Updated token
 */
async function updateTokenScore(token) {
  if (!token || !token.mintAddress) {
    return token;
  }
  
  try {
    const enhancedScore = await getEnhancedScore(token);
    token.potentialScore = enhancedScore;
    return await token.save();
  } catch (error) {
    console.error(`Error updating token score for ${token.mintAddress}:`, error);
    return token;
  }
}

module.exports = {
  getEnhancedScore,
  updateTokenScore
};
