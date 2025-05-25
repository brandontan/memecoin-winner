const mongoose = require('mongoose');
const { collectTokenTransactions } = require('../src/services/transactionCollector');

// Token to analyze
const TOKEN_ADDRESS = '3e68JicuTepVb2p7p6ajHyB3FembdXfp7UF35RufHK37';

// Connect to MongoDB
const MONGODB_URI = 'mongodb://localhost:27017/memecoin';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    console.log(`Starting transaction collection for token: ${TOKEN_ADDRESS}`);
    
    // Collect transactions with a limit for testing
    const result = await collectTokenTransactions(TOKEN_ADDRESS, {
      maxTransactions: 100, // Limit for testing
      forceUpdate: false    // Set to true to re-fetch existing transactions
    });
    
    console.log('Collection completed:');
    console.log(JSON.stringify(result, null, 2));
    
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
