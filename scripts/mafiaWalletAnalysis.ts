import { Connection, PublicKey, ParsedAccountData } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
// Simple sleep function to avoid adding external dependencies
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Real token addresses from the known winners
const REAL_WINNERS = [
  { 
    address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump', 
    name: 'SWARM',
    launchDate: '2024-01-23T00:00:00Z'
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

// Track wallet activity across tokens
const walletActivity: Record<string, Set<string>> = {}; // wallet -> Set of token names
const tokenHolders: Record<string, Set<string>> = {}; // token -> Set of holders

// RPC configuration
const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Connect to Solana mainnet with rate limiting
const connection = new Connection(RPC_ENDPOINT, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
  httpHeaders: {
    'Content-Type': 'application/json',
  },
});

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0) throw error;
    
    // If rate limited, wait and retry
    if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      const delay = RETRY_DELAY_MS * (MAX_RETRIES - retries + 1);
      console.log(`Rate limited. Retrying in ${delay}ms... (${retries} attempts left)`);
      await sleep(delay);
      return fetchWithRetry(fn, retries - 1);
    }
    
    throw error;
  }
}

async function getTokenHolders(tokenAddress: string, tokenName: string) {
  console.log(`\n🔍 Fetching holders for ${tokenName} (${tokenAddress})...`);
  
  try {
    const tokenPubkey = new PublicKey(tokenAddress);
    
    // Get token supply to calculate market cap
    const supplyResponse = await fetchWithRetry(() => 
      connection.getTokenSupply(tokenPubkey)
    );
    
    console.log(`   - Total supply: ${supplyResponse.value.amount} ${tokenName}`);
    
    // Get token accounts (holders)
    const tokenAccounts = await fetchWithRetry(() =>
      connection.getTokenLargestAccounts(tokenPubkey)
    );
    
    console.log(`   - Found ${tokenAccounts.value.length} token accounts`);
    
    // Process each token account (top 20 holders)
    for (const account of tokenAccounts.value.slice(0, 20)) {
      try {
        const accountInfo = await fetchWithRetry(() =>
          connection.getParsedAccountInfo(account.address)
        );
        
        const data = accountInfo.value?.data as ParsedAccountData;
        const owner = data?.parsed?.info?.owner;
        
        if (owner) {
          // Track wallet activity
          if (!walletActivity[owner]) {
            walletActivity[owner] = new Set();
          }
          walletActivity[owner].add(tokenName);
          
          // Track token holders
          if (!tokenHolders[tokenName]) {
            tokenHolders[tokenName] = new Set();
          }
          tokenHolders[tokenName].add(owner);
          
          console.log(`   - Wallet ${owner.slice(0, 8)}... holds ${account.uiAmount} ${tokenName}`);
        }
      } catch (error) {
        console.error(`Error processing account:`, error);
      }
    }
    
  } catch (error) {
    console.error(`Error fetching data for ${tokenName}:`, error);
  }
}

async function analyzeMafiaWallets() {
  console.log("🚀 Starting mafia wallet analysis...\n");
  
  // Process each token one by one with delays
  for (const [index, token] of REAL_WINNERS.entries()) {
    await getTokenHolders(token.address, token.name);
    
    // Add delay between token requests to avoid rate limiting
    if (index < REAL_WINNERS.length - 1) {
      console.log(`\n⏳ Waiting before next request...\n`);
      await sleep(3000);
    }
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

// Run the analysis
(async () => {
  try {
    console.log("🔗 Connected to Solana mainnet");
    console.log("🧮 Analyzing top holders of winning tokens...\n");
    
    const mafiaWallets = await analyzeMafiaWallets();
    
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
