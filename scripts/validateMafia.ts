import axios from 'axios';
import { RPC_ENDPOINT } from '../src/config/blockchain';

// Known winning tokens
const WINNERS = [
  { name: 'SWARM', address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump' },
  { name: 'PHDKitty', address: 'BDmd5acf2CyydhnH6vjrCrCEY1ixHzRRK9HToPiKPdcS' },
  { name: 'CHARLES', address: 'EwBUeMFm8Zcn79iJkDns3NdcL8t8B6Xikh9dKgZtpump' },
  { name: 'APEX', address: '6rE8kJHDuskmwj1MmehvwL2i4QXdLmPTYnrxJm6Cpump' },
  { name: 'USDUC', address: 'CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump' }
];

// Track wallets and their token purchases
const walletStats: Record<string, Set<string>> = {}; // wallet -> Set of token addresses
const tokenWallets: Record<string, Set<string>> = {}; // token -> Set of wallets

// Simple rate limiter
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getEarlyBuyers(tokenAddress: string, hoursAfterLaunch: number = 1): Promise<Set<string>> {
  console.log(`Fetching early buyers for ${tokenAddress}...`);
  const wallets = new Set<string>();
  
  try {
    // Use Helius API to get early transactions
    const response = await axios.post(RPC_ENDPOINT, {
      jsonrpc: '2.0',
      id: 'helius-test',
      method: 'searchAssets',
      params: {
        ownerAddress: tokenAddress,
        tokenType: 'all',
        limit: 1000,
        page: 1,
        sortBy: { sortBy: 'created', sortDirection: 'asc' },
        // First hour only
        before: new Date(Date.now() - (24 - hoursAfterLaunch) * 60 * 60 * 1000).toISOString(),
        after: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      },
    });

    // Process transactions to find buyers
    const transactions = response.data?.result?.items || [];
    transactions.forEach((tx: any) => {
      if (tx.owner && tx.tokenAmount > 0) {
        wallets.add(tx.owner);
      }
    });
    
    console.log(`Found ${wallets.size} unique early buyers`);
    return wallets;
  } catch (error) {
    console.error(`Error fetching data for ${tokenAddress}:`, error.message);
    return wallets;
  }
}

async function validateMafiaExists() {
  console.log("🚀 VALIDATING MAFIA WALLET HYPOTHESIS\n");
  
  // 1. Get early buyers for each token
  for (const token of WINNERS) {
    console.log(`\n🔍 Analyzing ${token.name} (${token.address})`);
    const buyers = await getEarlyBuyers(token.address);
    tokenWallets[token.address] = buyers;
    
    // Track which tokens each wallet bought
    for (const wallet of buyers) {
      if (!walletStats[wallet]) {
        walletStats[wallet] = new Set();
      }
      walletStats[wallet].add(token.address);
    }
    
    // Be nice to the API
    await sleep(1000);
  }
  
  // 2. Find wallets that bought multiple winners
  console.log("\n🔎 Analyzing wallet overlaps...");
  const mafiaWallets = Object.entries(walletStats)
    .filter(([_, tokens]) => tokens.size > 1)
    .sort((a, b) => b[1].size - a[1].size);
  
  // 3. Print results
  if (mafiaWallets.length === 0) {
    console.log("\n❌ NO MAFIA WALLETS FOUND");
    console.log("None of the early buyers purchased multiple winning tokens.");
    return;
  }
  
  console.log(`\n🎯 FOUND ${mafiaWallets.length} POTENTIAL MAFIA WALLETS\n`);
  
  mafiaWallets.forEach(([wallet, tokens], index) => {
    const tokenNames = Array.from(tokens)
      .map(addr => WINNERS.find(t => t.address === addr)?.name || 'Unknown')
      .join(', ');
      
    console.log(`${index + 1}. ${wallet}`);
    console.log(`   Bought: ${tokenNames}`);
    console.log(`   Tokens: ${tokens.size}`);
    console.log('   ---');
  });
  
  // 4. Save results for further analysis
  console.log("\n💾 Saving results to mafia_wallets.json");
  const fs = require('fs');
  fs.writeFileSync('mafia_wallets.json', JSON.stringify(mafiaWallets, (_, v) => 
    v instanceof Set ? Array.from(v) : v, 2));
}

// Run the validation
validateMafiaExists().catch(console.error);
