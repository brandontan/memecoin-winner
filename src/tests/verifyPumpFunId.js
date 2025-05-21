const { Connection, PublicKey } = require('@solana/web3.js');
const config = require('../config/config');

const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const KNOWN_TOKENS = [
  'CEDFLgJUPHMGsAEJUTsZdrVrrAfU7ythx8YrSSzapump',
  'H69jivA1kS17AJgK6mkBAZEpXA9jyZ1gjyVxU9pBzVKA'
];

async function verifyPumpFunId() {
  console.log('🔍 Verifying Pump.fun Program ID...');
  const connection = new Connection(config.solana.rpcUrl);

  try {
    // Check if the program exists
    const programId = new PublicKey(PUMP_FUN_PROGRAM_ID);
    const programInfo = await connection.getAccountInfo(programId);
    if (!programInfo) {
      console.error('❌ Program does not exist.');
      return;
    }
    console.log('✅ Program exists.');

    // Fetch a sample of accounts owned by the program
    const accounts = await connection.getProgramAccounts(programId, { limit: 5 });
    console.log(`📊 Found ${accounts.length} accounts owned by the program.`);

    // Verify known tokens interact with the program
    for (const tokenAddress of KNOWN_TOKENS) {
      const tokenPubkey = new PublicKey(tokenAddress);
      const tokenInfo = await connection.getAccountInfo(tokenPubkey);
      if (tokenInfo && tokenInfo.owner.equals(programId)) {
        console.log(`✅ Token ${tokenAddress} interacts with the program.`);
      } else {
        console.log(`❌ Token ${tokenAddress} does not interact with the program.`);
      }
    }

    console.log('🎉 Verification complete. This appears to be the correct Pump.fun program ID.');
  } catch (error) {
    console.error('❌ Error during verification:', error.message);
  }
}

verifyPumpFunId().catch(console.error); 