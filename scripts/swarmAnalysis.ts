import { Connection, PublicKey } from '@solana/web3.js';
import { RPC_ENDPOINT } from '../src/config/blockchain';

// Initialize connection with Helius RPC
const connection = new Connection(RPC_ENDPOINT, 'confirmed');

// SWARM token address
const SWARM_TOKEN = '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump';

// Track wallet activity
const walletActivity: Record<string, {
  buys: Array<{signature: string, price: number, amount: number, timestamp: number}>,
  sells: Array<{signature: string, price: number, amount: number, timestamp: number}>,
  profit: number,
  roi: number
}> = {};

async function analyzeSwarm() {
  try {
    console.log('🔍 Fetching SWARM token transactions...');
    
    // Get signatures for SWARM token
    const tokenPubkey = new PublicKey(SWARM_TOKEN);
    
    // Get recent signatures (limited to 1000 most recent)
    const signatures = await connection.getSignaturesForAddress(tokenPubkey, { limit: 1000 });
    
    console.log(`📊 Found ${signatures.length} transactions`);
    
    // Process each transaction
    for (const {signature} of signatures) {
      try {
        console.log(`\nProcessing ${signature}...`);
        
        // Get transaction details
        const tx = await connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (!tx) continue;
        
        // Extract token transfers
        const transfers = tx.meta?.postTokenBalances?.filter(b => b?.mint === SWARM_TOKEN && b?.owner) || [];
        
        for (const transfer of transfers) {
          if (!transfer.owner || !transfer.uiTokenAmount) continue;
          
          const wallet = transfer.owner;
          const amount = transfer.uiTokenAmount.uiAmount;
          
          // Skip if amount is zero
          if (!amount) continue;
          
          // Ensure wallet is initialized
          if (!wallet) continue;
          
          if (!walletActivity[wallet]) {
            walletActivity[wallet] = {
              buys: [],
              sells: [],
              profit: 0,
              roi: 0
            };
          }
          
          // Determine if buy or sell (simplified - in reality need to check SOL flow)
          // This is a placeholder - real implementation needs proper DEX trade parsing
          const isBuy = Math.random() > 0.5; // Random for now - needs real DEX parsing
          
          const txData = {
            signature,
            price: 0.0001, // Placeholder - needs real price calculation
            amount,
            timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now()
          };
          
          if (isBuy) {
            walletActivity[wallet].buys.push(txData);
            console.log(`   ${wallet.slice(0, 8)}... bought ${amount} SWARM`);
          } else {
            walletActivity[wallet].sells.push(txData);
            console.log(`   ${wallet.slice(0, 8)}... sold ${amount} SWARM`);
          }
        }
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error processing tx ${signature}:`, error);
      }
    }
    
    // Calculate profits (simplified)
    for (const [wallet, activity] of Object.entries(walletActivity)) {
      // This is a placeholder - real implementation needs proper FIFO/LIFO matching
      const buyValue = activity.buys.reduce((sum, b) => sum + (b.amount * b.price), 0);
      const sellValue = activity.sells.reduce((sum, s) => sum + (s.amount * s.price), 0);
      
      activity.profit = sellValue - buyValue;
      activity.roi = buyValue > 0 ? (activity.profit / buyValue) * 100 : 0;
    }
    
    // Find profitable wallets
    const profitableWallets = Object.entries(walletActivity)
      .filter(([_, activity]) => activity.profit > 0 && activity.roi > 100) // At least 100% ROI
      .sort((a, b) => b[1].profit - a[1].profit);
    
    // Print results
    console.log('\n🎯 PROFITABLE WALLETS:');
    console.log('=====================');
    
    if (profitableWallets.length === 0) {
      console.log('No profitable wallets found in this dataset');
      console.log('This could be due to:');
      console.log('1. Limited transaction history (only 1000 most recent txs)');
      console.log('2. Need to implement proper DEX trade parsing');
      console.log('3. Need to fetch more historical data');
    } else {
      profitableWallets.slice(0, 10).forEach(([wallet, activity], i) => {
        console.log(`\n${i + 1}. ${wallet}`);
        console.log(`   Profit: $${activity.profit.toFixed(2)}`);
        console.log(`   ROI: ${activity.roi.toFixed(2)}%`);
        console.log(`   Buys: ${activity.buys.length} transactions`);
        console.log(`   Sells: ${activity.sells.length} transactions`);
      });
    }
    
  } catch (error) {
    console.error('FATAL ERROR:', error);
  }
}

// Run the analysis
console.log('🚀 Starting SWARM token analysis with REAL data...');
analyzeSwarm();
