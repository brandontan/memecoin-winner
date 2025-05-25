import { Connection, PublicKey } from '@solana/web3.js';

// Quick script to verify token addresses and get basic info
async function checkTokenAddresses() {
  console.log("🔍 VERIFYING TOKEN ADDRESSES...\n");
  
  // Token addresses to verify
  const tokens = [
    { address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump', name: 'SWARM' },
    { address: 'BDmd5acf2CyydhnH6vjrCrCEY1ixHzRRK9HToPiKPdcS', name: 'PHDKitty' },
    { address: 'EwBUeMFm8Zcn79iJkDns3NdcL8t8B6Xikh9dKgZtpump', name: 'CHARLES' },
    { address: '6rE8kJHDuskmwj1MmehvwL2i4QXdLmPTYnrxJm6Cpump', name: 'APEX' },
    { address: 'CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump', name: 'USDUC' }
  ];

  // Use a dedicated RPC endpoint for better rate limits
  const connection = new Connection('https://solana-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY', 'confirmed');
  
  for (const token of tokens) {
    try {
      console.log(`\n🔎 Checking ${token.name} (${token.address}):`);
      
      // Check if address is valid
      try {
        new PublicKey(token.address);
        console.log("   ✅ Valid Solana address");
      } catch (e) {
        console.log(`   ❌ INVALID ADDRESS: ${e.message}`);
        continue;
      }
      
      // Get token supply (basic verification)
      try {
        const supply = await connection.getTokenSupply(new PublicKey(token.address));
        console.log(`   - Supply: ${supply.value.amount} ${token.name}`);
        console.log(`   - Decimals: ${supply.value.decimals}`);
      } catch (e) {
        console.log(`   ❌ Could not fetch token info: ${e.message}`);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error checking ${token.name}:`, error);
    }
  }
  
  console.log("\n✅ VERIFICATION COMPLETE");
  console.log("\n💡 NEXT STEPS:");
  console.log("1. Sign up for a free Alchemy account");
  console.log("2. Create a Solana RPC endpoint");
  console.log("3. Replace YOUR_ALCHEMY_KEY with your actual API key");
  console.log("4. Run this script again");
}

// Run the check
checkTokenAddresses().catch(console.error);
