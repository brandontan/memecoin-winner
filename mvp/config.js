require('dotenv').config();

const config = {
  // Database
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/memecoin-mvp',
  
  // Solana
  solanaRpc: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  
  // Pump.fun Program ID
  pumpFunProgram: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  
  // Scoring thresholds
  alertThreshold: 80,
  
  // Monitoring intervals (milliseconds)
  monitorInterval: 5000, // Check every 5 seconds
  
  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};

module.exports = config;