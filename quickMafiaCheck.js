const axios = require('axios');

// Helius API configuration
const HELIUS_API_KEY = 'd238f464-c2ad-4e23-a9c2-475fc1ca4c96';
const HELIUS_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Known winning tokens
const WINNERS = [
  { name: 'SWARM', address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump' },
  { name: 'PHDKitty', address: 'BDmd5acf2CyydhnH6vjrCrCEY1ixHzRRK9HToPiKPdcS' },
  { name: 'CHARLES', address: 'EwBUeMFm8Zcn79iJkDns3NdcL8t8B6Xikh9dKgZtpump' }
];

// Track wallets and their token purchases
const walletStats = new Map();

async function getTopWallets(tokenAddress) {
  try {
    const response = await axios.post(HELIUS_URL, {
      jsonrpc: '2.0',
      id: 'token-holders',
      method: 'getTokenLargestAccounts',
      params: [tokenAddress]
    });
    
    return response.data.result.value
      .filter(account => account.uiAmount > 0)
      .map(account => ({
        address: account.address,
        amount: account.uiAmount
      }));
  } catch (error) {
    console.error(`Error fetching holders for ${tokenAddress}:`, error.message);
    return [];
  }
}

async function findMafiaWallets() {
  console.log("🔍 HUNTING FOR MAFIA WALLETS\n");
  
  // Get top 20 holders for each token
  for (const token of WINNERS) {
    console.log(`Checking ${token.name}...`);
    const holders = await getTopWallets(token.address);
    
    for (const holder of holders.slice(0, 20)) {
      if (!walletStats.has(holder.address)) {
        walletStats.set(holder.address, new Set());
      }
      walletStats.get(holder.address).add(token.name);
    }
    
    // Be nice to the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Find wallets holding multiple tokens
  const mafiaWallets = Array.from(walletStats.entries())
    .filter(([_, tokens]) => tokens.size > 1)
    .sort((a, b) => b[1].size - a[1].size);
  
  // Print results
  if (mafiaWallets.length === 0) {
    console.log("\n❌ NO SUSPICIOUS WALLETS FOUND");
    return;
  }
  
  console.log("\n🎯 SUSPICIOUS WALLETS FOUND:");
  mafiaWallets.forEach(([wallet, tokens], index) => {
    const shortWallet = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
    console.log(`${index + 1}. ${shortWallet} holds: ${Array.from(tokens).join(', ')}`);
  });
}

// Run the check
findMafiaWallets().catch(console.error);
