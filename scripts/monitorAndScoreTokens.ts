import { Connection, PublicKey } from '@solana/web3.js';
import mongoose from 'mongoose';
import Token from '../src/models/token';
import { config } from '../src/config/config';

// Constants
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

// Track processed signatures to avoid duplicates
const processedSignatures = new Set<string>();

// Create a connection to the Solana network
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/memecoin';
    
    // Use simplified connection options for local development
    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      retryReads: true,
      ssl: false, // Disable SSL for local development
      tls: false  // Disable TLS for local development
    };
    
    console.log('Connecting to MongoDB at:', mongoUri);
    await mongoose.connect(mongoUri, options);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    console.log('Please make sure MongoDB is running and accessible');
    process.exit(1);
  }
}

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
        
        // Create token data with initial liquidity (using a placeholder for now)
        const tokenData = {
            mintAddress,
            creator,
            name: `Token-${mintAddress.slice(0, 6)}`,
            symbol: `TKN-${mintAddress.slice(0, 3).toUpperCase()}`,
            initialLiquidity: 5000, // Placeholder - in a real app, extract this from the transaction
            launchTime: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
            currentPrice: 0,
            currentVolume: 0,
            holderCount: 0,
            liquidityAmount: 0,
            potentialScore: 0,
            isActive: true
        };

        // Calculate score - using type assertion to bypass TypeScript error
        tokenData.potentialScore = (Token as any).calculateInitialScore(tokenData);

        return tokenData;
    } catch (error) {
        console.error('Error processing transaction:', error);
        return null;
    }
}

// Main monitoring function
async function monitorAndScoreTokens() {
    console.log('Starting to monitor and score Pump.fun token launches...');
    console.log('Press Ctrl+C to stop monitoring\n');

    try {
        // Connect to MongoDB
        await connectToMongoDB();
        
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
                const tokenData = await processTransaction(latestSignature);
                
                if (tokenData) {
                    try {
                        console.log('\n--- New Pump.fun Token Detected ---');
                        console.log(`Token Address: ${tokenData.mintAddress}`);
                        console.log(`Creator: ${tokenData.creator}`);
                        console.log(`Launch Time: ${tokenData.launchTime.toISOString()}`);
                        console.log(`Potential Score: ${tokenData.potentialScore}`);
                        
                        // Save to database
                        const token = new Token(tokenData);
                        const savedToken = await token.save();
                        
                        console.log(`✅ Token saved with score: ${savedToken.potentialScore}`);
                        console.log(`Transaction: https://solscan.io/tx/${latestSignature}\n`);
                        
                        // Exit after finding and saving one token
                        console.log('Token found and saved! Exiting...');
                        process.exit(0);
                        
                    } catch (error) {
                        console.error('Error saving token to database:', error);
                    }
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
            mongoose.connection.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('Error in monitorAndScoreTokens:', error);
        process.exit(1);
    }
}

// Run the monitor
monitorAndScoreTokens().catch(console.error);
