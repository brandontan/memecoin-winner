import { Connection } from '@solana/web3.js';
import { MafiaTrackerV2 } from '../src/services/mafiaTrackerV2';
import { logger } from '../src/utils/logger';
import config from '../config';

async function verifyMafiaWallets() {
  console.log("🔍 VERIFYING MAFIA WALLET DETECTION\n");
  
  // Initialize connection and tracker
  const connection = new Connection(config.solanaRpc, 'confirmed');
  const tracker = new MafiaTrackerV2(connection);
  
  try {
    // Initialize with known winners
    console.log("Initializing tracker with known winners...");
    await tracker.initialize();
    
    // Get the list of mafia wallets
    const mafiaWallets = Array.from(tracker['mafiaWallets'].values());
    
    console.log("\n📊 RESULTS:");
    console.log(`Total mafia wallets found: ${mafiaWallets.length}`);
    
    if (mafiaWallets.length === 0) {
      console.log("❌ NO MAFIA WALLETS FOUND - CHECK YOUR DATA!");
      return;
    }
    
    // Show top 5 mafia wallets
    console.log("\n🎯 TOP 5 MAFIA WALLETS:");
    mafiaWallets.slice(0, 5).forEach((wallet, i) => {
      console.log(`\n${i + 1}. ${wallet.wallet.slice(0, 8)}...`);
      console.log(`   - Win Rate: ${(wallet.winRate * 100).toFixed(1)}%`);
      console.log(`   - Avg Multiplier: ${wallet.avgMultiplier.toFixed(1)}x`);
      console.log(`   - Total Profit: $${wallet.totalProfit.toLocaleString()}`);
    });
    
    console.log("\n✅ VERIFICATION COMPLETE");
    
  } catch (error) {
    console.error("❌ ERROR DURING VERIFICATION:", error);
  }
}

// Run the verification
verifyMafiaWallets().catch(console.error);
