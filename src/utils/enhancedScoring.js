/**
 * Enhanced scoring algorithm for memecoin potential
 * Uses existing data points to calculate a more accurate score
 */

/**
 * Calculate enhanced potential score for a token
 * @param {Object} token - Token document from database
 * @param {Array} transactions - Array of transaction documents
 * @returns {Object} Object containing score and score components
 */
function calculateEnhancedScore(token, transactions = []) {
  // Calculate all score components
  const components = {
    // 1. Liquidity Score (0-20)
    liquidity: calculateLiquidityScore(token.liquidityAmount),
    
    // 2. Holder Score (0-18)
    holder: calculateHolderScore(token.holderCount),
    
    // 3. Volume Score (0-18)
    volume: calculateVolumeScore(token.currentVolume),
    
    // 4. Age & Momentum Score (0-14)
    age: calculateAgeScore(token.createdAt),
    
    // 5. Transaction Velocity Score (0-18)
    velocity: calculateTransactionVelocityScore(transactions, token.createdAt),
    
    // 6. Wallet Concentration Score (0-12)
    concentration: calculateWalletConcentrationScore(token.holderDistribution || [])
  };
  
  // Calculate total score (sum of all components)
  const totalScore = Object.values(components).reduce((sum, score) => sum + score, 0);
  
  // Get concentration risk status
  const concentrationRisk = getConcentrationRisk(components.concentration);
  
  return {
    score: Math.min(Math.max(Math.round(totalScore), 0), 100),
    components,
    concentrationRisk
  };
}

/**
 * Calculate liquidity score component
 * @param {Number} liquidity - Token liquidity amount
 * @returns {Number} Score between 0-25
 */
function calculateLiquidityScore(liquidity = 0) {
  if (liquidity <= 0) return 0;
  if (liquidity < 1000) return 5;
  if (liquidity < 5000) return 10;
  if (liquidity < 20000) return 15;
  if (liquidity < 50000) return 20;
  return 25;
}

/**
 * Calculate holder score component
 * @param {Number} holderCount - Number of token holders
 * @returns {Number} Score between 0-20
 */
function calculateHolderScore(holderCount = 0) {
  if (holderCount <= 0) return 0;
  if (holderCount < 10) return 2;
  if (holderCount < 50) return 5;
  if (holderCount < 100) return 10;
  if (holderCount < 500) return 15;
  return 20;
}

/**
 * Calculate volume score component
 * @param {Number} volume - Current token volume
 * @returns {Number} Score between 0-20
 */
function calculateVolumeScore(volume = 0) {
  if (volume <= 0) return 0;
  if (volume < 1000) return 2;
  if (volume < 10000) return 5;
  if (volume < 50000) return 10;
  if (volume < 200000) return 15;
  return 20;
}

/**
 * Calculate age score component (newer tokens get higher scores)
 * @param {Date} createdAt - Token creation timestamp
 * @returns {Number} Score between 0-15
 */
function calculateAgeScore(createdAt) {
  if (!createdAt) return 0;
  
  const now = new Date();
  const ageInHours = (now - new Date(createdAt)) / (1000 * 60 * 60);
  
  // Newer tokens (< 24h) get higher scores
  if (ageInHours < 1) return 15;
  if (ageInHours < 3) return 13;
  if (ageInHours < 6) return 10;
  if (ageInHours < 12) return 8;
  if (ageInHours < 24) return 5;
  if (ageInHours < 48) return 3;
  return 1;
}

/**
 * Calculate transaction velocity score
 * @param {Array} transactions - Array of transaction documents
 * @param {Date} createdAt - Token creation timestamp
 * @returns {Number} Score between 0-20
 */
function calculateTransactionVelocityScore(transactions = [], createdAt) {
  if (!transactions.length) return 0;
  
  // 1. Calculate transactions per hour
  const now = new Date();
  const ageInHours = Math.max(1, (now - new Date(createdAt)) / (1000 * 60 * 60));
  const txPerHour = transactions.length / ageInHours;
  
  // 2. Calculate transaction acceleration (increasing or decreasing velocity)
  const hourlyBuckets = {};
  
  // Group transactions by hour
  transactions.forEach(tx => {
    const txTime = new Date(tx.timestamp);
    const hourKey = `${txTime.getFullYear()}-${txTime.getMonth()}-${txTime.getDate()}-${txTime.getHours()}`;
    hourlyBuckets[hourKey] = (hourlyBuckets[hourKey] || 0) + 1;
  });
  
  // Convert to array and sort by time
  const hourlyTxs = Object.entries(hourlyBuckets)
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
  
  // Calculate acceleration (change in velocity)
  let acceleration = 0;
  if (hourlyTxs.length > 1) {
    let velocityChanges = 0;
    for (let i = 1; i < hourlyTxs.length; i++) {
      velocityChanges += hourlyTxs[i].count - hourlyTxs[i-1].count;
    }
    acceleration = velocityChanges / (hourlyTxs.length - 1);
  }
  
  // 3. Calculate score based on transactions per hour and acceleration
  let velocityScore = 0;
  
  // Score based on transactions per hour
  if (txPerHour < 1) velocityScore += 2;
  else if (txPerHour < 5) velocityScore += 5;
  else if (txPerHour < 10) velocityScore += 8;
  else if (txPerHour < 20) velocityScore += 10;
  else velocityScore += 12;
  
  // Add bonus for positive acceleration
  if (acceleration > 0) {
    velocityScore += Math.min(8, acceleration * 2);
  }
  
  return Math.min(velocityScore, 20);
}

/**
 * Calculate wallet concentration score and risk level
 * @param {Array} holderDistribution - Array of {address, balance}
 * @returns {Object} Score and risk analysis
 */
function calculateWalletConcentrationScore(holderDistribution = []) {
  if (!holderDistribution.length) return { score: 0, risk: 'unknown', top10pct: 0 };
  
  // Sort holders by balance (descending)
  const sortedHolders = [...holderDistribution]
    .sort((a, b) => b.balance - a.balance);
  
  const totalSupply = sortedHolders.reduce((sum, h) => sum + h.balance, 0);
  if (totalSupply === 0) return { score: 0, risk: 'unknown', top10pct: 0 };
  
  // Calculate top 10 wallets concentration
  const top10 = sortedHolders.slice(0, 10);
  const top10Total = top10.reduce((sum, h) => sum + h.balance, 0);
  const top10Pct = (top10Total / totalSupply) * 100;
  
  // Calculate score (0-12 points)
  let score = 0;
  let risk = 'high';
  
  if (top10Pct > 80) {
    score = 2;  // Extremely high concentration
    risk = 'manipulated';
  } else if (top10Pct > 60) {
    score = 4;  // Very high concentration
    risk = 'high';
  } else if (top10Pct > 40) {
    score = 6;  // High concentration
    risk = 'elevated';
  } else if (top10Pct > 20) {
    score = 9;  // Moderate concentration
    risk = 'moderate';
  } else {
    score = 12; // Low concentration
    risk = 'low';
  }
  
  return { score, risk, top10pct: top10Pct };
}

/**
 * Get concentration risk status with emoji
 * @param {Object} concentrationData - From calculateWalletConcentrationScore
 * @returns {Object} Risk status with emoji and label
 */
function getConcentrationRisk(concentrationData) {
  const { risk, top10pct } = concentrationData;
  
  switch (risk) {
    case 'manipulated':
      return { emoji: '💀', label: 'Manipulated', level: 'critical', top10pct };
    case 'high':
      return { emoji: '⚠️', label: 'High Risk', level: 'high', top10pct };
    case 'elevated':
      return { emoji: '🔶', label: 'Elevated Risk', level: 'elevated', top10pct };
    case 'moderate':
      return { emoji: '🔸', label: 'Moderate Risk', level: 'moderate', top10pct };
    case 'low':
      return { emoji: '✅', label: 'Healthy', level: 'low', top10pct };
    default:
      return { emoji: '❓', label: 'Unknown', level: 'unknown', top10pct: 0 };
  }
}

// Update exports
module.exports = {
  calculateEnhancedScore,
  calculateLiquidityScore,
  calculateHolderScore,
  calculateVolumeScore,
  calculateAgeScore,
  calculateTransactionVelocityScore,
  calculateWalletConcentrationScore,
  getConcentrationRisk
};
