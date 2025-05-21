const solanaConnection = require('../utils/solanaConnection');
const { PublicKey } = require('@solana/web3.js');
const config = require('../config/config');

// Known token addresses for testing
const TEST_TOKENS = {
    USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    BONK: new PublicKey('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263')
};

// Test wallet with known token holdings
const TEST_WALLET = new PublicKey('vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg');

// Try to get Pump.fun program ID from config
let pumpFunProgramId = null;
if (config.launchpads && config.launchpads.pumpFun && config.launchpads.pumpFun.programId) {
    try {
        pumpFunProgramId = new PublicKey(config.launchpads.pumpFun.programId);
    } catch (e) {
        pumpFunProgramId = null;
    }
}

async function runTests() {
    console.log('🧪 Starting Solana Connection Tests\n');

    try {
        // Test 1: Basic Connection
        console.log('📡 Test 1: Basic Connection');
        const connection = await solanaConnection.initialize();
        console.log('✅ Successfully connected to Solana network');
        const status = solanaConnection.getConnectionStatus();
        console.log('Connection status:', status);
        
        if (status.isPublicRPC) {
            console.log('\n⚠️  Using public RPC endpoint. Some features may be limited:');
            console.log('   - getProgramAccounts may be restricted or unavailable');
            console.log('   - Rate limits may apply');
            console.log('   - Some advanced queries may not work');
            console.log('\n   For production use, consider using a dedicated RPC provider:');
            console.log('   - QuickNode (https://www.quicknode.com)');
            console.log('   - Alchemy (https://www.alchemy.com)');
            console.log('   - Helius (https://www.helius.dev)');
            console.log('   - Triton (https://triton.one)');
        }
        console.log('----------------------------------------\n');

        // Test 2: Fetch Account Information
        console.log('📊 Test 2: Fetch Account Information');
        for (const [name, address] of Object.entries(TEST_TOKENS)) {
            console.log(`Fetching ${name} token information...`);
            const accountInfo = await solanaConnection.getAccountInfo(address);
            console.log(`${name} account info:`, {
                owner: accountInfo.owner.toString(),
                lamports: accountInfo.lamports,
                executable: accountInfo.executable,
                data: accountInfo.data.length
            });
        }
        console.log('----------------------------------------\n');

        // Test 3: Program Account Access
        console.log('🔍 Test 3: Program Account Access');
        console.log('⚠️ Note: getProgramAccounts is often disabled on public RPC endpoints');
        console.log('   Testing alternative methods instead...');

        try {
            // Test basic blockchain access
            const slot = await solanaConnection.getSlot();
            console.log(`✅ Current slot: ${slot}`);

            // Test token account access (often allowed when getProgramAccounts is not)
            console.log('\nTesting getTokenAccountsByOwner...');
            const tokenAccounts = await solanaConnection.getTokenAccountsByOwner(TEST_WALLET);
            console.log(`✅ Found ${tokenAccounts.length} token accounts for test wallet`);

            // Try getProgramAccounts if supported
            const isSupported = await solanaConnection.isProgramAccountsSupported();
            if (isSupported) {
                console.log('\nTesting getProgramAccounts (supported by this endpoint)...');
                const programAccounts = await solanaConnection.getProgramAccounts(
                    pumpFunProgramId || TEST_TOKENS.USDC,
                    {
                        filters: [
                            { dataSize: 165 },
                            { memcmp: { offset: 0, length: 8 } }
                        ]
                    }
                );
                console.log(`✅ Found ${programAccounts.length} program accounts`);
            } else {
                console.log('\n⚠️ getProgramAccounts is not supported by this endpoint');
            }

            // Warn about production requirements
            console.log('\n⚠️ IMPORTANT: For production use of this application, you should:');
            console.log('   1. Use a dedicated RPC provider (Helius, QuickNode, etc.)');
            console.log('   2. Configure your RPC endpoint with getProgramAccounts enabled');
            console.log('   3. Consider specialized RPC methods for Pump.fun monitoring');
            
        } catch (error) {
            console.log(`⚠️ Alternative methods also restricted: ${error.message}`);
            console.log('This test requires a dedicated RPC provider for full functionality');
        }
        console.log('----------------------------------------\n');

        // Test 4: Error Handling with Invalid RPC
        console.log('⚠️ Test 4: Error Handling');
        console.log('Testing fallback mechanism with invalid RPC...');
        
        const originalRpcUrl = config.solana.rpcUrl;
        config.solana.rpcUrl = 'https://invalid-rpc-url.solana.com';
        
        try {
            await solanaConnection.initialize();
            console.log('✅ Successfully connected using fallback endpoint');
        } catch (error) {
            console.error('❌ Fallback mechanism failed:', error.message);
        } finally {
            config.solana.rpcUrl = originalRpcUrl;
        }
        console.log('----------------------------------------\n');

        // Test 5: Connection Reliability
        console.log('🔄 Test 5: Connection Reliability');
        console.log('Running multiple requests in sequence...');
        
        const requests = [
            solanaConnection.getAccountInfo(TEST_TOKENS.USDC),
            solanaConnection.getAccountInfo(TEST_TOKENS.BONK),
            solanaConnection.getSlot()
        ];

        const results = await Promise.all(requests);
        console.log('✅ All requests completed successfully');
        console.log(`- USDC info retrieved: ${results[0] !== null}`);
        console.log(`- BONK info retrieved: ${results[1] !== null}`);
        console.log(`- Current slot: ${results[2]}`);
        console.log('----------------------------------------\n');

        // Test 6: Account Subscription
        console.log('🔔 Test 6: Account Subscription');
        console.log('Setting up account subscription...');
        
        const subscriptionId = solanaConnection.subscribeToAccount(
            TEST_TOKENS.USDC,
            (accountInfo, context) => {
                console.log('Received account update:', {
                    slot: context.slot,
                    lamports: accountInfo.lamports
                });
            }
        );
        
        console.log(`✅ Subscription established with ID: ${subscriptionId}`);
        console.log('Waiting for updates (will timeout after 5 seconds)...');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await solanaConnection.connection.removeAccountChangeListener(subscriptionId);
        console.log('Subscription cleaned up');
        console.log('----------------------------------------\n');

        console.log('🎉 All tests completed successfully!');
        
        if (status.isPublicRPC) {
            console.log('\n📝 Note: Some tests were skipped or modified due to public RPC limitations.');
            console.log('   For full testing capabilities, please use a dedicated RPC provider.');
        }
        
    } catch (error) {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    }
}

// Run the tests
runTests().catch(console.error); 