const axios = require('axios');
const { RPC_ENDPOINT } = require('../src/config/blockchain');

// Known winning tokens
const WINNERS = [
  { name: 'SWARM', address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump' },
  { name: 'PHDKitty', address: 'BDmd5acf2CyydhnH6vjrCrCEY1ixHzRRK9HToPiKPdcS' },
  { name: 'CHARLES', address: 'EwBUeMFm8Zcn79iJkDns3NdcL8t8B6Xikh9dKgZtpump' },
  { name: 'APEX', address: '6rE8kJHDuskmwj1MmehvwL2i4QXdLmPTYnrxJm6Cpump' },
  { name: 'USDUC', address: 'CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump' }
];

// Track wallets and their token purchases
const walletStats = {}; // wallet -> Set of token addresses

// Simple rate limiter
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getTokenHolders(tokenAddress, limit = 1000) {
  console.log(`Fetching token holders for ${tokenAddress}...`);
  const wallets = new Set();
  
  try {
    // Use Helius DAS API to get token holders
    const response = await axios.post(RPC_ENDPOINT, {
      jsonrpc: '2.0',
      id: 'helius-holder-check',
      method: 'getTokenAccounts',
      params: {
        mint: tokenAddress,
        page: 1,
        limit,
        sortBy: { sortBy: 'amount', sortOrder: 'desc' },
      },
    });

    // Process token accounts to get wallet addresses
    const tokenAccounts = response.data?.result?.token_accounts || [];
    tokenAccounts.forEach((account) => {
      if (account.owner) {
        wallets.add(account.owner);
      }
    });
    
    console.log(`Found ${wallets.size} unique holders`);
    return wallets;
  } catch (error) {
    console.error(`Error fetching holders for ${tokenAddress}:`, error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    return wallets;
  }
}

async function checkForMafiaWallets() {
  console.log("🔍 HUNTING FOR MAFIA WALLETS USING HELIUS\n");
  
  // 1. Get top holders for each token
  for (const token of WINNERS) {
    console.log(`\n🔍 Checking ${token.name} (${token.address})`);
    const holders = await getTokenHolders(token.address, 500); // Top 500 holders
    
    // Track which tokens each wallet holds
    for (const wallet of holders) {
      if (!walletStats[wallet]) {
        walletStats[wallet] = new Set();
      }
      walletStats[wallet].add(token.address);
    }
    
    // Be nice to the API
    await sleep(500);
  }
  
  // 2. Find wallets that hold multiple winners
  console.log("\n🔎 Analyzing wallet overlaps...");
  const mafiaWallets = Object.entries(walletStats)
    .filter(([_, tokens]) => tokens.size > 1)
    .sort((a, b) => b[1].size - a[1].size);
  
  // 3. Print results
  if (mafiaWallets.length === 0) {
    console.log("\n❌ NO SUSPICIOUS WALLETS FOUND");
    return;
  }
  
  console.log(`\n🎯 FOUND ${mafiaWallets.length} SUSPICIOUS WALLETS\n`);
  
  mafiaWallets.forEach(([wallet, tokens], index) => {
    const tokenNames = Array.from(tokens)
      .map(addr => {
        const token = WINNERS.find(t => t.address === addr);
        return token ? token.name : 'Unknown';
      })
      .join(', ');
      
    console.log(`${index + 1}. ${wallet}`);
    console.log(`   Holds: ${tokenNames}`);
    console.log(`   Token Count: ${tokens.size}`);
    console.log('   ---');
  });
  
  // 4. Save results for further analysis
  console.log("\n💾 Saving results to mafia_wallets_helius.json");
  const fs = require('fs');
  fs.writeFileSync('mafia_wallets_helius.json', JSON.stringify(mafiaWallets.map(([wallet, tokens]) => ({
    wallet,
    tokens: Array.from(tokens),
    tokenNames: Array.from(tokens).map(addr => WINNERS.find(t => t.address === addr)?.name || 'Unknown')
  })), null, 2));
}

// Run the check
checkForMafiaWallets().catch(console.error);
