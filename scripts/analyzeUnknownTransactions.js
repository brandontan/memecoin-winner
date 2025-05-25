const mongoose = require('mongoose');
const { Connection, PublicKey } = require('@solana/web3.js');
const Transaction = require('../src/models/transaction');
const { PROGRAM_IDS } = require('../src/utils/transactionParser');

// Token to analyze
const TOKEN_ADDRESS = '3e68JicuTepVb2p7p6ajHyB3FembdXfp7UF35RufHK37';

// Connect to MongoDB
const MONGODB_URI = 'mongodb://localhost:27017/memecoin';

// Configure Solana connection
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Known program IDs and their names
const KNOWN_PROGRAMS = {
  ...PROGRAM_IDS,
  // Add more program IDs as we discover them
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s': 'Metaplex Token Metadata',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token Account Program',
  'ComputeBudget111111111111111111111111111111': 'Compute Budget Program',
  'Vote111111111111111111111111111111111111111': 'Vote Program',
  'Stake11111111111111111111111111111111111111': 'Stake Program',
  'Config1111111111111111111111111111111111111': 'Config Program',
  'SysvarC1ock11111111111111111111111111111111': 'Sysvar: Clock',
  'SysvarRent111111111111111111111111111111111': 'Sysvar: Rent',
  'SysvarS1otHashes111111111111111111111111111': 'Sysvar: Slot Hashes',
  'SysvarStakeHistory1111111111111111111111111': 'Sysvar: Stake History',
  'SysvarEpochSchedu1e111111111111111111111111': 'Sysvar: Epoch Schedule'
};

// Helper function to get program name
function getProgramName(programId) {
  return KNOWN_PROGRAMS[programId] || 'Unknown Program';
}

// Helper function to extract all instructions
function extractAllInstructions(txData) {
  const instructions = [];
  
  // Add main instructions
  if (txData.transaction?.message?.instructions) {
    instructions.push(...txData.transaction.message.instructions.map(ix => ({
      ...ix,
      isInner: false
    })));
  }
  
  // Add inner instructions
  if (txData.meta?.innerInstructions) {
    for (const innerInstructionSet of txData.meta.innerInstructions) {
      if (innerInstructionSet.instructions) {
        instructions.push(...innerInstructionSet.instructions.map(ix => ({
          ...ix,
          isInner: true,
          parentIndex: innerInstructionSet.index
        })));
      }
    }
  }
  
  return instructions;
}

// Helper function to analyze token balances
function analyzeTokenBalances(txData, tokenAddress) {
  const preBalances = txData.meta?.preTokenBalances || [];
  const postBalances = txData.meta?.postTokenBalances || [];
  
  // Filter for our token
  const preTokenBalances = preBalances.filter(b => b.mint === tokenAddress);
  const postTokenBalances = postBalances.filter(b => b.mint === tokenAddress);
  
  // Create maps for easier lookup
  const preBalanceMap = new Map();
  const postBalanceMap = new Map();
  
  preTokenBalances.forEach(balance => {
    preBalanceMap.set(balance.owner, {
      amount: balance.uiTokenAmount.uiAmount || 0,
      accountIndex: balance.accountIndex
    });
  });
  
  postTokenBalances.forEach(balance => {
    postBalanceMap.set(balance.owner, {
      amount: balance.uiTokenAmount.uiAmount || 0,
      accountIndex: balance.accountIndex
    });
  });
  
  // Calculate changes
  const changes = [];
  
  // Combine all owners
  const allOwners = new Set([...preBalanceMap.keys(), ...postBalanceMap.keys()]);
  
  allOwners.forEach(owner => {
    const preBal = preBalanceMap.get(owner)?.amount || 0;
    const postBal = postBalanceMap.get(owner)?.amount || 0;
    const change = postBal - preBal;
    
    if (change !== 0) {
      changes.push({
        owner,
        preBal,
        postBal,
        change
      });
    }
  });
  
  return {
    preTokenBalances,
    postTokenBalances,
    changes
  };
}

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get a sample of unknown transactions
    console.log(`Fetching unknown transactions for token: ${TOKEN_ADDRESS}`);
    const unknownTransactions = await Transaction.find({ 
      tokenAddress: TOKEN_ADDRESS,
      transactionType: 'unknown'
    }).limit(5).lean();
    
    console.log(`Found ${unknownTransactions.length} unknown transactions to analyze`);
    
    if (unknownTransactions.length === 0) {
      console.log('No unknown transactions to analyze');
      await mongoose.disconnect();
      return;
    }
    
    // Analyze each transaction
    for (let i = 0; i < unknownTransactions.length; i++) {
      const tx = unknownTransactions[i];
      console.log(`\n\n======= ANALYZING UNKNOWN TRANSACTION ${i+1}/${unknownTransactions.length} =======`);
      console.log(`Signature: ${tx.signature}`);
      console.log(`Timestamp: ${new Date(tx.timestamp).toISOString()}`);
      
      try {
        // Get full transaction data
        const txData = await connection.getParsedTransaction(
          tx.signature,
          { maxSupportedTransactionVersion: 0 }
        );
        
        if (!txData) {
          console.log('No transaction data found');
          continue;
        }
        
        // Extract account keys
        const accountKeys = txData.transaction?.message?.accountKeys || [];
        console.log(`\nAccount Keys (${accountKeys.length}):`);
        accountKeys.forEach((key, index) => {
          console.log(`  [${index}] ${key.pubkey.toString()} (${key.signer ? 'Signer' : 'Not Signer'}, ${key.writable ? 'Writable' : 'Read-only'})`);
        });
        
        // Extract all instructions
        const instructions = extractAllInstructions(txData);
        console.log(`\nInstructions (${instructions.length}):`);
        
        // Group programs used
        const programsUsed = new Map();
        
        instructions.forEach((ix, index) => {
          const programId = ix.programId?.toString() || 'Unknown';
          const programName = getProgramName(programId);
          
          // Count program usage
          programsUsed.set(programId, (programsUsed.get(programId) || 0) + 1);
          
          console.log(`  [${index}] ${ix.isInner ? 'Inner' : 'Outer'} Instruction: Program = ${programName} (${programId})`);
          
          // If it's a parsed instruction, show more details
          if (ix.parsed) {
            console.log(`    Type: ${ix.parsed.type}`);
            if (ix.parsed.info) {
              console.log(`    Info: ${JSON.stringify(ix.parsed.info, null, 2)}`);
            }
          } else if (ix.data) {
            console.log(`    Data: ${ix.data}`);
          }
        });
        
        // Analyze token balances
        const tokenBalances = analyzeTokenBalances(txData, TOKEN_ADDRESS);
        
        console.log(`\nToken Balance Changes (${tokenBalances.changes.length}):`);
        tokenBalances.changes.forEach(change => {
          console.log(`  Owner: ${change.owner}`);
          console.log(`    Before: ${change.preBal}`);
          console.log(`    After: ${change.postBal}`);
          console.log(`    Change: ${change.change > 0 ? '+' : ''}${change.change}`);
        });
        
        // Summarize programs used
        console.log('\nPrograms Used:');
        for (const [programId, count] of programsUsed.entries()) {
          const programName = getProgramName(programId);
          console.log(`  ${programName} (${programId}): ${count} instruction(s)`);
        }
        
        // Analyze why this transaction wasn't classified
        console.log('\nAnalysis of why this transaction was not classified:');
        
        // Check for token program instructions
        const hasTokenProgramInstructions = instructions.some(ix => 
          ix.programId?.toString() === PROGRAM_IDS.TOKEN_PROGRAM
        );
        
        // Check for DEX interactions
        const hasDexInteractions = instructions.some(ix => 
          Object.values(PROGRAM_IDS).includes(ix.programId?.toString()) &&
          ix.programId?.toString() !== PROGRAM_IDS.TOKEN_PROGRAM &&
          ix.programId?.toString() !== PROGRAM_IDS.SYSTEM_PROGRAM &&
          ix.programId?.toString() !== PROGRAM_IDS.ASSOCIATED_TOKEN_PROGRAM
        );
        
        // Check for token balance changes
        const hasTokenBalanceChanges = tokenBalances.changes.length > 0;
        
        if (!hasTokenProgramInstructions) {
          console.log('- No Token Program instructions found');
        }
        
        if (!hasDexInteractions) {
          console.log('- No known DEX program interactions found');
        }
        
        if (!hasTokenBalanceChanges) {
          console.log('- No token balance changes for our token');
        }
        
        // Suggest classification
        console.log('\nSuggested Classification:');
        if (hasTokenBalanceChanges) {
          // Check if it's a mint operation
          const isMint = tokenBalances.changes.some(change => 
            change.preBal === 0 && change.postBal > 0
          );
          
          if (isMint) {
            console.log('This appears to be a MINT operation');
          } else {
            // Check if it's a transfer
            const isTransfer = tokenBalances.changes.length >= 2;
            if (isTransfer) {
              console.log('This appears to be a TRANSFER operation');
            } else {
              console.log('This appears to be a token operation, but not clearly identifiable');
            }
          }
        } else if (hasDexInteractions) {
          console.log('This appears to be a DEX interaction, but our token is not directly involved');
        } else {
          console.log('This appears to be a setup or administrative transaction');
        }
        
      } catch (error) {
        console.error(`Error analyzing transaction ${tx.signature}:`, error.message);
      }
    }
    
    // Summarize findings
    console.log('\n\n======= SUMMARY OF FINDINGS =======');
    console.log('1. Common patterns in unknown transactions:');
    console.log('   - [Will be filled based on analysis]');
    console.log('2. Missing program identifications:');
    console.log('   - [Will be filled based on analysis]');
    console.log('3. Suggested parser improvements:');
    console.log('   - [Will be filled based on analysis]');
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main();
