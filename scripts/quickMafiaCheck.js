const { Connection, PublicKey } = require('@solana/web3.js');

// Initialize connection to Solana mainnet
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Known winning tokens with their mint addresses
const WINNERS = [
  { name: 'SWARM', address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump' },
  { name: 'PHDKitty', address: 'BDmd5acf2CyydhnH6vjrCrCEY1ixHzRRK9HToPiKPdcS' },
  { name: 'CHARLES', address: 'EwBUeMFm8Zcn79iJkDns3NdcL8t8B6Xikh9dKgZtpump' },
  { name: 'APEX', address: '6rE8kJHDuskmwj1MmehvwL2i4QXdLmPTYnrxJm6Cpump' },
  { name: 'USDUC', address: 'CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump' }
];

// Track wallets and their token purchases
const walletStats = {}; // wallet -> array of token addresses

async function getTokenAccountsByMint(mintAddress) {
  console.log(`Fetching token accounts for ${mintAddress}...`);
  try {
    const accounts = await connection.getTokenLargestAccounts(new PublicKey(mintAddress));
    return accounts.value;
  } catch (error) {
    console.error(`Error fetching accounts for ${mintAddress}:`, error.message);
    return [];
  }
}

async function quickMafiaCheck() {
  console.log("🚀 QUICK MAFIA WALLET VALIDATION\n");
  
  // 1. Get top holders for each token
  for (const token of WINNERS) {
    console.log(`\n🔍 Checking ${token.name} (${token.address})`);
    const accounts = await getTokenAccountsByMint(token.address);
    
    // Just take top 50 holders for this quick check
    const topHolders = accounts.slice(0, 50);
    console.log(`   Found ${topHolders.length} top holders`);
    
    // Track which wallets hold which tokens
    for (const account of topHolders) {
      const wallet = account.address.toString();
      if (!walletStats[wallet]) {
        walletStats[wallet] = new Set();
      }
      walletStats[wallet].add(token.address);
    }
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
}

// Run the check
quickMafiaCheck().catch(console.error);
