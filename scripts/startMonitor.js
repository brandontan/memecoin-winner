#!/usr/bin/env node

require('dotenv').config();
const TokenMonitor = require('../src/services/tokenMonitor');
const logger = require('../src/utils/logger');

async function main() {
  try {
    logger.info('🚀 Starting Memecoin Winner Monitor...');
    
    // Start the token monitor
    await TokenMonitor.start();
    
    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      logger.info('Shutting down monitor...');
      await TokenMonitor.stop();
      process.exit(0);
    });
    
    // Keep the process alive
    setInterval(() => {}, 1000);
    
  } catch (error) {
    logger.error('Fatal error in monitor:', error);
    process.exit(1);
  }
}

main();
