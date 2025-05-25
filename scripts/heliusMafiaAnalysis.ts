import { Connection, PublicKey } from '@solana/web3.js';
import { HELIUS_API_KEY, RPC_ENDPOINT, TOKENS } from '../src/config/blockchain';

// Track wallet activity across tokens
const walletActivity: Record<string, Set<string>> = {}; // wallet -> Set of token names

// Initialize connection with Helius RPC
const connection = new Connection(RPC_ENDPOINT, 'confirmed');

// Simple delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getTokenHolders(tokenAddress: string, tokenName: string) {
  console.log(`\n🔍 Fetching holders for ${tokenName} (${tokenAddress})`);
  
  try {
    const tokenPubkey = new PublicKey(tokenAddress);
    
    // Get token supply
    const supply = await connection.getTokenSupply(tokenPubkey);
    console.log(`   - Supply: ${supply.value.amount} ${tokenName}`);
    
    // Get token accounts (holders)
    console.log('   - Fetching token accounts...');
    const tokenAccounts = await connection.getTokenLargestAccounts(tokenPubkey);
    
    console.log(`   - Found ${tokenAccounts.value.length} token accounts`);
    
    // Process top 10 holders
    const topHolders = tokenAccounts.value.slice(0, 10);
    
    for (const account of topHolders) {
      try {
        const accountInfo = await connection.getParsedAccountInfo(account.address);
        const data = (accountInfo.value?.data as any)?.parsed?.info;
        
        if (data?.owner) {
          const owner = data.owner;
          
          // Track wallet activity
          if (!walletActivity[owner]) {
            walletActivity[owner] = new Set();
          }
          walletActivity[owner].add(tokenName);
          
          console.log(`   - Wallet ${owner.slice(0, 8)}... holds ${account.uiAmount} ${tokenName}`);
        }
        
        // Add delay between account info requests
        await delay(500);
        
      } catch (error) {
        console.error(`Error processing account:`, error);
      }
    }
    
    // Add delay between token requests
    await delay(2000);
    
  } catch (error) {
    console.error(`Error fetching data for ${tokenName}:`, error);
  }
}

async function analyzeMafiaWallets() {
  console.log('🚀 Starting mafia wallet analysis with Helius RPC...\n');
  
  // Process each token one by one with delays
  for (const [index, token] of TOKENS.entries()) {
    await getTokenHolders(token.address, token.name);
    
    // Add delay between token requests
    if (index < TOKENS.length - 1) {
      console.log(`\n⏳ Waiting before next request...\n`);
      await delay(3000);
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
    if (!HELIUS_API_KEY || HELIUS_API_KEY.length < 30) {
      console.error('❌ ERROR: Please update the Helius API key in src/config/blockchain.ts');
      console.log('\nTo get a free Helius API key:');
      console.log('1. Go to helius.xyz');
      console.log('2. Sign up for a free account');
      console.log('3. Get your API key from the dashboard');
      console.log('4. Update the HELIUS_API_KEY in src/config/blockchain.ts');
      process.exit(1);
    }
    
    console.log('🔗 Connected to Solana mainnet via Helius RPC');
    console.log('🧮 Analyzing top holders of winning tokens...\n');
    
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
