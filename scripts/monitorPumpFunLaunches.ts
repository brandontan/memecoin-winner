import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../src/config/config';

// Constants
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

// Track processed signatures to avoid duplicates
const processedSignatures = new Set<string>();

// Create a connection to the Solana network
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Function to extract token info from transaction
async function processTransaction(signature: string) {
    try {
        // Get the transaction details
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta || tx.meta.err) {
            return null;
        }

        // Look for token creation instruction
        const tokenCreationIx = tx.transaction.message.instructions.find(
            (ix: any) => 
                'programId' in ix && 
                ix.programId.equals(PUMP_FUN_PROGRAM_ID)
        );

        if (!tokenCreationIx) {
            return null;
        }

        // Extract token mint address from the transaction
        const accounts = tx.transaction.message.accountKeys;
        const mintAddress = accounts.find(acc => 
            acc.signer === false && 
            acc.writable === true
        )?.pubkey.toString();

        if (!mintAddress) {
            return null;
        }

        // Get the creator (first signer)
        const creator = accounts.find(acc => acc.signer)?.pubkey.toString();

        return {
            mintAddress,
            creator,
            signature,
            blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date()
        };
    } catch (error) {
        console.error('Error processing transaction:', error);
        return null;
    }
}

// Main monitoring function
async function monitorPumpFunLaunches() {
    console.log('Starting to monitor Pump.fun token launches...');
    console.log('Press Ctrl+C to stop monitoring\n');

    try {
        // Get current slot to start monitoring from
        const startSlot = await connection.getSlot();
        console.log(`Starting monitoring from slot: ${startSlot}`);
        
        // Set up slot subscription
        const subscriptionId = connection.onProgramAccountChange(
            PUMP_FUN_PROGRAM_ID,
            async (accountInfo, context) => {
                // Get the transaction signature
                const signatures = await connection.getSignaturesForAddress(
                    PUMP_FUN_PROGRAM_ID,
                    { limit: 1, before: undefined }
                );

                if (signatures.length === 0) return;
                
                const latestSignature = signatures[0].signature;
                
                // Skip if we've already processed this signature
                if (processedSignatures.has(latestSignature)) {
                    return;
                }
                
                processedSignatures.add(latestSignature);
                
                // Process the transaction
                const tokenInfo = await processTransaction(latestSignature);
                
                if (tokenInfo) {
                    console.log('\n--- New Pump.fun Token Detected ---');
                    console.log(`Token Address: ${tokenInfo.mintAddress}`);
                    console.log(`Creator: ${tokenInfo.creator}`);
                    console.log(`Block Time: ${tokenInfo.blockTime.toISOString()}`);
                    console.log(`Transaction: https://solscan.io/tx/${tokenInfo.signature}\n`);
                    
                    // Exit after finding one token
                    console.log('Token found! Exiting...');
                    process.exit(0);
                }
            },
            'confirmed'
        );

        // Set a timeout to stop after 5 minutes if no token is found
        setTimeout(() => {
            console.log('\nNo tokens found after 5 minutes of monitoring.');
            process.exit(0);
        }, 5 * 60 * 1000);

        // Handle process termination
        process.on('SIGINT', () => {
            console.log('\nStopping monitor...');
            connection.removeProgramAccountChangeListener(subscriptionId);
            process.exit(0);
        });

    } catch (error) {
        console.error('Error in monitorPumpFunLaunches:', error);
        process.exit(1);
    }
}

// Run the monitor
monitorPumpFunLaunches().catch(console.error);
