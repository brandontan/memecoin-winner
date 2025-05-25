import { Connection, PublicKey, ParsedAccountData } from '@solana/web3.js';

// Real token addresses from the known winners
const REAL_WINNERS = [
  { 
    address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump', 
    name: 'SWARM',
    launchDate: '2024-01-23T00:00:00Z' // Approximate launch date
  },
  { 
    address: 'BDmd5acf2CyydhnH6vjrCrCEY1ixHzRRK9HToPiKPdcS', 
    name: 'PHDKitty',
    launchDate: '2024-01-21T00:00:00Z'
  },
  { 
    address: 'EwBUeMFm8Zcn79iJkDns3NdcL8t8B6Xikh9dKgZtpump', 
    name: 'CHARLES',
    launchDate: '2024-01-25T00:00:00Z'
  },
  { 
    address: '6rE8kJHDuskmwj1MmehvwL2i4QXdLmPTYnrxJm6Cpump', 
    name: 'APEX',
    launchDate: '2024-01-20T00:00:00Z'
  },
  { 
    address: 'CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump', 
    name: 'USDUC',
    launchDate: '2024-01-24T00:00:00Z'
  }
];

// Connect to Solana mainnet
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Track wallet activity across tokens
const walletActivity: Record<string, Set<string>> = {}; // wallet -> Set of token names

async function getTokenTransactions(tokenAddress: string, tokenName: string) {
  console.log(`\n🔍 Fetching transactions for ${tokenName} (${tokenAddress})...`);
  
  try {
    const tokenPubkey = new PublicKey(tokenAddress);
    
    // Get all token accounts for this token
    const tokenAccounts = await connection.getTokenLargestAccounts(tokenPubkey);
    
    // Process each token account (up to 10 largest holders)
    for (const account of tokenAccounts.value.slice(0, 10)) {
      try {
        const accountInfo = await connection.getParsedAccountInfo(account.address);
        const data = accountInfo.value?.data as ParsedAccountData;
        const owner = data?.parsed?.info?.owner;
        
        if (owner) {
          if (!walletActivity[owner]) {
            walletActivity[owner] = new Set();
          }
          walletActivity[owner].add(tokenName);
          
          console.log(`   - Wallet ${owner.slice(0, 8)}... holds ${account.uiAmount} ${tokenName}`);
        }
      } catch (error) {
        console.error(`Error processing account:`, error);
      }
    }
    
  } catch (error) {
    console.error(`Error fetching transactions for ${tokenName}:`, error);
  }
}

async function findMafiaWallets() {
  console.log("🚀 Starting real mafia wallet detection...\n");
  
  // Process each token
  for (const token of REAL_WINNERS) {
    await getTokenTransactions(token.address, token.name);
  }
  
  // Find wallets that hold multiple winners
  const mafiaWallets = Object.entries(walletActivity)
    .filter(([_, tokens]) => tokens.size >= 2) // At least 2 winners
    .map(([wallet, tokens]) => ({
      wallet,
      tokens: Array.from(tokens),
      count: tokens.size
    }))
    .sort((a, b) => b.count - a.count);
  
  return mafiaWallets;
}

// Run the real test
(async () => {
  try {
    console.log("🔗 Connected to Solana mainnet");
    console.log("🧮 Analyzing top holders of winning tokens...\n");
    
    const mafiaWallets = await findMafiaWallets();
    
    console.log("\n🎯 MAFIA WALLET ANALYSIS:");
    console.log(`Found ${mafiaWallets.length} wallets holding multiple winning tokens\n`);
    
    // Display top mafia wallets
    mafiaWallets.slice(0, 10).forEach((wallet, i) => {
      console.log(`${i + 1}. ${wallet.wallet}`);
      console.log(`   - Holds ${wallet.count} winning tokens: ${wallet.tokens.join(', ')}`);
    });
    
    if (mafiaWallets.length === 0) {
      console.log("\n❌ NO MAFIA WALLETS FOUND - VERIFY TOKEN ADDRESSES AND TRY AGAIN");
    } else {
      console.log("\n✅ MAFIA WALLETS DETECTED - ANALYSIS COMPLETE");
    }
    
  } catch (error) {
    console.error("❌ ERROR DURING ANALYSIS:", error);
  }
})();
