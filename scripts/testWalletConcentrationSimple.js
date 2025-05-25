const { 
  calculateWalletConcentrationScore,
  getConcentrationRisk 
} = require('../src/utils/enhancedScoring');

// Test wallet concentration with different scenarios
function testConcentrationScenario(description, holderDistribution) {
  console.log(`\n📊 ${description}`);
  console.log('='.repeat(60));
  
  // Calculate concentration
  const concentration = calculateWalletConcentrationScore(holderDistribution);
  const risk = getConcentrationRisk(concentration);
  
  // Display results
  console.log('Top 10 Wallets:');
  holderDistribution.slice(0, 10).forEach((holder, i) => {
    console.log(`  ${i + 1}. ${holder.address.padEnd(10)}: ${holder.percentage.toFixed(2)}%`);
  });
  
  console.log('\nConcentration Analysis:');
  console.log(`- Top 10 Wallets Control: ${concentration.top10pct.toFixed(2)}%`);
  console.log(`- Concentration Score: ${concentration.score}/12`);
  console.log(`- Risk Level: ${risk.emoji} ${risk.label} (${risk.level})`);
  
  // Calculate and show potential impact on total score
  const baseScore = 70; // Example base score without concentration
  const totalScore = baseScore + concentration.score;
  console.log(`\nImpact on Total Score (Base: 70 + Concentration: ${concentration.score}):`);
  console.log(`- Total Score: ${totalScore}/100`);
  
  return { concentration, risk };
}

// Test Case 1: Healthy Distribution
const healthyDistribution = Array(1000).fill(0).map((_, i) => ({
  address: `holder_${i + 1}`,
  balance: 1000 + Math.random() * 100,
  percentage: 0.1 // Evenly distributed
}));
testConcentrationScenario('Healthy Distribution (1000 holders, even distribution)', healthyDistribution);

// Test Case 2: Risky Distribution
const riskyDistribution = [
  { address: 'whale1', balance: 20000, percentage: 8 },
  { address: 'whale2', balance: 18000, percentage: 7 },
  { address: 'whale3', balance: 15000, percentage: 6 },
  { address: 'whale4', balance: 12000, percentage: 5 },
  { address: 'whale5', balance: 10000, percentage: 4 },
  ...Array(95).fill(0).map((_, i) => ({
    address: `holder_${i + 1}`,
    balance: 24.24,
    percentage: 0.12
  }))
];
testConcentrationScenario('Risky Distribution (5 whales control 30%)', riskyDistribution);

// Test Case 3: Manipulated Distribution
const manipulatedDistribution = [
  { address: 'dev1', balance: 40000, percentage: 40 },
  { address: 'dev2', balance: 25000, percentage: 25 },
  { address: 'dev3', balance: 15000, percentage: 15 },
  ...Array(97).fill(0).map((_, i) => ({
    address: `holder_${i + 1}`,
    balance: 20.62,
    percentage: 0.2
  }))
];
testConcentrationScenario('Manipulated Distribution (3 wallets control 80%)', manipulatedDistribution);

console.log('\n✅ Wallet Concentration Analysis Test Complete!');
