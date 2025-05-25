const { Connection, PublicKey } = require('@solana/web3.js');

// Initialize Solana connection
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Known winning tokens
const WINNERS = [
  { name: 'SWARM', address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump' },
  { name: 'PHDKitty', address: 'BDmd5acf2CyydhnH6vjrCrCEY1ixHzRRK9HToPiKPdcS' },
  { name: 'CHARLES', address: 'EwBUeMFm8Zcn79iJkDns3NdcL8t8B6Xikh9dKgZtpump' },
  { name: 'APEX', address: '6rE8kJHDuskmwj1MmehvwL2i4QXdLmPTYnrxJm6Cpump' },
  { name: 'USDUC', address: 'CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump' }
];

// Track wallets and their token purchases
const walletStats = new Map(); // wallet -> Set of token names

async function getFirstBuyers(tokenAddress, limit = 20) {
  console.log(`\n🔍 Finding first buyers for ${tokenAddress}`);
  try {
    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(tokenAddress),
      { limit: 50, before: undefined }
    );
    
    console.log(`Found ${signatures.length} transactions`);
    return signatures.slice(0, limit).map(tx => tx.signature);
  } catch (error) {
    console.error(`Error finding buyers for ${tokenAddress}:`, error.message);
    return [];
  }
}

async function getTransaction(signature) {
  try {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });
    return tx;
  } catch (error) {
    console.error('Error fetching transaction:', error.message);
    return null;
  }
}

function extractBuyerFromTransaction(tx, tokenAddress) {
  try {
    // Get all accounts involved in the transaction
    const accountKeys = tx.transaction.message.accountKeys;
    
    // The first account is typically the fee payer (buyer)
    if (accountKeys.length > 0) {
      return accountKeys[0].toString();
    }
  } catch (error) {
    console.error('Error extracting buyer:', error.message);
  }
  return null;
}

async function analyzeTransactions() {
  console.log("🔍 ANALYZING EARLY BUYERS ACROSS TOKENS\n");
  
  // Track buyers across tokens
  for (const token of WINNERS) {
    const txSignatures = await getFirstBuyers(token.address);
    console.log(`Analyzing ${txSignatures.length} transactions for ${token.name}...`);
    
    for (const sig of txSignatures) {
      const tx = await getTransaction(sig);
      if (!tx) continue;
      
      const buyer = extractBuyerFromTransaction(tx, token.address);
      if (!buyer) continue;
      
      if (!walletStats.has(buyer)) {
        walletStats.set(buyer, new Set());
      }
      walletStats.get(buyer).add(token.name);
      
      // Be nice to the RPC
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Find wallets that bought multiple tokens
  const suspiciousWallets = Array.from(walletStats.entries())
    .filter(([_, tokens]) => tokens.size > 1)
    .sort((a, b) => b[1].size - a[1].size);
  
  // Print results
  if (suspiciousWallets.length === 0) {
    console.log("\n❌ NO WALLETS FOUND BUYING MULTIPLE TOKENS");
    return;
  }
  
  console.log("\n🎯 MULTI-TOKEN BUYERS FOUND:");
  suspiciousWallets.forEach(([wallet, tokens], index) => {
    const shortWallet = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
    console.log(`${index + 1}. Wallet ${shortWallet} bought: ${Array.from(tokens).join(', ')}`);
  });
  
  console.log(`\nFound ${suspiciousWallets.length} wallets that bought multiple winners early!`);
}

// Run the analysis
console.log("🚀 STARTING QUICK BUYER ANALYSIS\n");
analyzeTransactions().catch(console.error);
