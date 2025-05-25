const axios = require('axios');

// Known winning tokens with their Solscan token addresses
const WINNERS = [
  { name: 'SWARM', address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump' },
  { name: 'PHDKitty', address: 'BDmd5acf2CyydhnH6vjrCrCEY1ixHzRRK9HToPiKPdcS' },
  { name: 'CHARLES', address: 'EwBUeMFm8Zcn79iJkDns3NdcL8t8B6Xikh9dKgZtpump' }
];

// Track wallets and their token purchases
const walletStats = new Map();

async function getTopHolders(tokenAddress) {
  try {
    // Use Solscan's token holders endpoint
    const response = await axios.get(`https://public-api.solscan.io/token/holders?tokenAddress=${tokenAddress}&limit=20`, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    return response.data.data || [];
  } catch (error) {
    console.error(`Error fetching holders for ${tokenAddress}:`, error.message);
    return [];
  }
}

async function findMafiaWallets() {
  console.log("🔍 QUICK MAFIA WALLET CHECK USING SOLSCAN\n");
  
  // Get top 20 holders for each token
  for (const token of WINNERS) {
    console.log(`Checking ${token.name}...`);
    const holders = await getTopHolders(token.address);
    
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
