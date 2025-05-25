const axios = require('axios');

// Helius API configuration
const HELIUS_API_KEY = 'd238f464-c2ad-4e23-a9c2-475fc1ca4c96';
const HELIUS_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Known winning tokens - just using 3 for speed
const WINNERS = [
  { name: 'SWARM', address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump' },
  { name: 'PHDKitty', address: 'BDmd5acf2CyydhnH6vjrCrCEY1ixHzRRK9HToPiKPdcS' },
  { name: 'CHARLES', address: 'EwBUeMFm8Zcn79iJkDns3NdcL8t8B6Xikh9dKgZtpump' }
];

// Track wallets and their token purchases
const walletStats = new Map();

async function getTokenHolders(tokenAddress) {
  try {
    const response = await axios.post(HELIUS_URL, {
      jsonrpc: '2.0',
      id: 'token-holders',
      method: 'getTokenAccounts',
      params: {
        mint: tokenAddress,
        page: 1,
        limit: 50,  // Just check top 50 holders
        sortBy: { sortBy: 'amount', sortOrder: 'desc' }
      }
    });
    
    return response.data.result?.token_accounts || [];
  } catch (error) {
    console.error(`Error fetching holders for ${tokenAddress}:`, error.message);
    if (error.response?.data) {
      console.error('API Error:', error.response.data);
    }
    return [];
  }
}

async function findMafiaWallets() {
  console.log("🔍 FINAL MAFIA WALLET CHECK USING HELIUS DAS\n");
  
  // Get top holders for each token
  for (const token of WINNERS) {
    console.log(`Checking ${token.name}...`);
    const holders = await getTokenHolders(token.address);
    
    for (const holder of holders) {
      const wallet = holder.owner;
      if (!walletStats.has(wallet)) {
        walletStats.set(wallet, new Set());
      }
      walletStats.get(wallet).add(token.name);
    }
    
    // Be nice to the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Find wallets holding multiple tokens
  const mafiaWallets = Array.from(walletStats.entries())
    .filter(([_, tokens]) => tokens.size > 1)
    .sort((a, b) => b[1].size - a[1].size);
  
  // Print results
  if (mafiaWallets.length === 0) {
    console.log("\n❌ NO SUSPICIOUS WALLETS FOUND");
    console.log("\nThis suggests one of two things:");
    console.log("1. Mafia wallets don't exist in the way we expected");
    console.log("2. Our detection method needs improvement");
    console.log("\nRecommendation: Try analyzing transaction history instead of just holders.");
    return;
  }
  
  console.log("\n🎯 SUSPICIOUS WALLETS FOUND:");
  mafiaWallets.forEach(([wallet, tokens], index) => {
    const shortWallet = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
    console.log(`${index + 1}. ${shortWallet} holds: ${Array.from(tokens).join(', ')}`);
  });
  
  console.log(`\nFound ${mafiaWallets.length} wallets holding multiple tokens!`);
}

// Run the check
findMafiaWallets().catch(console.error);
