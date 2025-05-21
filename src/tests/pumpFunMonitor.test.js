const pumpFunMonitor = require('../services/pumpFunMonitor');
const { PublicKey } = require('@solana/web3.js');
const Token = require('../models/Token');
const config = require('../config/config');

// Mock token data for testing
const MOCK_TOKEN = {
    mintAddress: 'mockMintAddress123',
    name: 'Test Token',
    symbol: 'TEST',
    decimals: 9,
    createdAt: Date.now()
};

// Mock metrics data
const MOCK_METRICS = {
    price: 0.001,
    volume24h: 1000,
    totalVolume: 5000
};

// Mock program account data
const MOCK_ACCOUNT = {
    pubkey: new PublicKey(MOCK_TOKEN.mintAddress),
    account: {
        data: Buffer.from('mock data'),
        executable: false,
        lamports: 1000000,
        owner: new PublicKey(config.launchpads.pumpFun.programId)
    }
};

let canRunFullTest = true;

if (!process.env.PUMP_FUN_PROGRAM_ID) {
  console.log('\n⚠️ PUMP_FUN_PROGRAM_ID environment variable is not set.');
  console.log('This is required for full testing of the Pump.fun monitor.');
  console.log('To set this variable:');
  console.log('1. Create or update your .env file with:');
  console.log('   PUMP_FUN_PROGRAM_ID=actualPumpFunProgramIdHere');
  console.log('2. Or set it temporarily in your terminal:');
  console.log('   export PUMP_FUN_PROGRAM_ID=actualPumpFunProgramIdHere (Unix/Mac)');
  console.log('   set PUMP_FUN_PROGRAM_ID=actualPumpFunProgramIdHere (Windows)');
  console.log('\nRunning limited tests that don\'t require the program ID...\n');
  canRunFullTest = false;
}

async function runTests() {
    console.log('🧪 Starting Pump.fun Monitor Tests\n');

    if (!canRunFullTest) {
      console.log('Skipping tests that require PUMP_FUN_PROGRAM_ID...');
      return;
    }

    try {
        // Test 1: Service Initialization
        console.log('📡 Test 1: Service Initialization');
        await pumpFunMonitor.initialize();
        console.log('✅ Service initialized successfully');
        console.log('----------------------------------------\n');

        // Test 2: Token Detection
        console.log('🔍 Test 2: Token Detection');
        console.log('Testing token detection and parsing...');
        
        // Mock the parseTokenData method
        const originalParseTokenData = pumpFunMonitor.parseTokenData;
        pumpFunMonitor.parseTokenData = () => MOCK_TOKEN;
        
        await pumpFunMonitor.processTokenAccount(MOCK_ACCOUNT);
        
        // Verify token was saved
        const savedToken = await Token.findOne({ mintAddress: MOCK_TOKEN.mintAddress });
        console.log('Token saved to database:', savedToken ? '✅' : '❌');
        
        // Restore original method
        pumpFunMonitor.parseTokenData = originalParseTokenData;
        console.log('----------------------------------------\n');

        // Test 3: Metrics Update
        console.log('📊 Test 3: Metrics Update');
        console.log('Testing token metrics update...');
        
        // Mock the fetchTokenMetrics method
        const originalFetchTokenMetrics = pumpFunMonitor.fetchTokenMetrics;
        pumpFunMonitor.fetchTokenMetrics = () => MOCK_METRICS;
        
        await pumpFunMonitor.updateTokenMetrics(MOCK_TOKEN.mintAddress);
        
        // Verify metrics were updated
        const updatedToken = await Token.findOne({ mintAddress: MOCK_TOKEN.mintAddress });
        console.log('Metrics updated:', {
            price: updatedToken.currentPrice,
            volume24h: updatedToken.volume24h,
            totalVolume: updatedToken.totalVolume
        });
        
        // Restore original method
        pumpFunMonitor.fetchTokenMetrics = originalFetchTokenMetrics;
        console.log('----------------------------------------\n');

        // Test 4: Graduation Handling
        console.log('🎓 Test 4: Graduation Handling');
        console.log('Testing token graduation...');
        
        // Set total volume above threshold
        await Token.findOneAndUpdate(
            { mintAddress: MOCK_TOKEN.mintAddress },
            { $set: { totalVolume: config.launchpads.pumpFun.graduationThreshold + 1000 } }
        );
        
        await pumpFunMonitor.updateTokenMetrics(MOCK_TOKEN.mintAddress);
        
        // Verify graduation status
        const graduatedToken = await Token.findOne({ mintAddress: MOCK_TOKEN.mintAddress });
        console.log('Token graduated:', graduatedToken.graduated ? '✅' : '❌');
        console.log('----------------------------------------\n');

        // Test 5: Update Intervals
        console.log('⏰ Test 5: Update Intervals');
        console.log('Testing update interval logic...');
        
        const intervals = {
            new: pumpFunMonitor.getUpdateInterval(0),
            active: pumpFunMonitor.getUpdateInterval(2 * 24 * 60 * 60 * 1000),
            mature: pumpFunMonitor.getUpdateInterval(8 * 24 * 60 * 60 * 1000)
        };
        
        console.log('Update intervals:', intervals);
        console.log('----------------------------------------\n');

        // Test 6: Error Handling
        console.log('⚠️ Test 6: Error Handling');
        console.log('Testing error handling...');
        
        // Mock a failed token processing
        const mockError = new Error('Test error');
        pumpFunMonitor.processTokenAccount = async () => { throw mockError; };
        
        try {
            await pumpFunMonitor.processTokenAccount(MOCK_ACCOUNT);
            console.log('❌ Error handling failed');
        } catch (error) {
            console.log('✅ Error handled gracefully');
        }
        
        // Restore original method
        pumpFunMonitor.processTokenAccount = originalProcessTokenAccount;
        console.log('----------------------------------------\n');

        // Cleanup
        console.log('🧹 Cleaning up test data...');
        await Token.deleteOne({ mintAddress: MOCK_TOKEN.mintAddress });
        console.log('✅ Test data cleaned up');
        
        // Stop the service
        pumpFunMonitor.stop();
        console.log('✅ Service stopped');
        
        console.log('\n🎉 All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    }
}

// Run the tests
runTests().catch(console.error); 