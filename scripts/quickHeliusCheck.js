const axios = require('axios');

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
const HELIUS_API_KEY = 'd238f464-c2ad-4e23-a9c2-475fc1ca4c96';
const HELIUS_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Simple rate limiter
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getTokenHolders(tokenAddress, limit = 50) {
  console.log(`Fetching top ${limit} holders for ${tokenAddress}...`);
  const wallets = new Set();
  
  try {
    const response = await axios.post(HELIUS_URL, {
      jsonrpc: '2.0',
      id: 'quick-check',
      method: 'getTokenLargestAccounts',
      params: [tokenAddress]
    });

    // Process the response to get wallet addresses
    const accounts = response.data?.result?.value || [];
    accounts.slice(0, limit).forEach(account => {
      if (account.address) {
        wallets.add(account.address);
      }
    });
    
    console.log(`Found ${wallets.size} top holders`);
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
  console.log("🔍 QUICK MAFIA WALLET CHECK USING HELIUS\n");
  
  // 1. Get top holders for each token
  for (const token of WINNERS) {
    console.log(`\n🔍 Checking ${token.name} (${token.address})`);
    const holders = await getTokenHolders(token.address, 50); // Top 50 holders
    
    // Track which tokens each wallet holds
    for (const wallet of holders) {
      if (!walletStats[wallet]) {
        walletStats[wallet] = new Set();
      }
      walletStats[wallet].add(token.name);
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
    const tokenNames = Array.from(tokens).join(', ');
    console.log(`${index + 1}. ${wallet}`);
    console.log(`   Holds: ${tokenNames}`);
    console.log(`   Token Count: ${tokens.size}`);
    console.log('   ---');
  });
  
  // 4. Save results
  console.log("\n💾 Saving results to mafia_wallets_quick_check.json");
  const fs = require('fs');
  fs.writeFileSync('mafia_wallets_quick_check.json', JSON.stringify(
    mafiaWallets.map(([wallet, tokens]) => ({
      wallet,
      tokens: Array.from(tokens),
      tokenCount: tokens.size
    })), 
    null, 
    2
  ));
}

// Run the check
checkForMafiaWallets().catch(console.error);
