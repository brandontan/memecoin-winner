import { MafiaTracker } from '../src/services/mafiaTracker';

async function testMafiaTracker() {
    console.log("🧪 TESTING MAFIA TRACKER...\n");
    
    const tracker = new MafiaTracker();
    
    // Initialize the tracker first
    console.log("Initializing MafiaTracker...");
    await tracker.initialize();
    
    // Check how many mafia wallets were found
    const mafiaWallets = tracker.getMafiaWallets();
    
    console.log(`\n📊 RESULTS:`);
    console.log(`Total mafia wallets found: ${mafiaWallets.length}`);
    
    if (mafiaWallets.length === 0) {
        console.log("❌ NO MAFIA WALLETS FOUND - CHECK YOUR DATA!");
        return;
    }
    
    // Show top 5 mafia wallets
    console.log("\n🎯 TOP 5 MAFIA WALLETS:");
    mafiaWallets.slice(0, 5).forEach((wallet, i) => {
        console.log(`${i + 1}. ${wallet.address.slice(0, 8)}...`);
        console.log(`   - Bought ${wallet.winningTokens.length} winners`);
        console.log(`   - Tokens: ${wallet.winningTokens.join(', ')}`);
    });
    
    // Test monitoring
    console.log("\n\n🔍 TESTING LIVE MONITORING:");
    const alerts = await tracker.checkMafiaActivity();
    
    if (alerts.length > 0) {
        console.log(`Found ${alerts.length} alerts!`);
        alerts.forEach(alert => {
            console.log(`\n🚨 ${alert.type}`);
            console.log(`Token: ${alert.token}`);
            console.log(`Details:`, alert.details);
        });
    } else {
        console.log("No current alerts (mafia might be sleeping)");
    }
    
    console.log("\n\n✅ TEST COMPLETE");
}

// RUN IT
testMafiaTracker().catch(console.error);
