import 'dotenv/config';
import { connectDB } from '../src/config/mongodb';
import { pumpFunMonitor } from '../src/services/pumpFunMonitor';
import logger from '../src/utils/logger';

async function startMonitoring() {
  try {
    // Connect to MongoDB
    logger.info('Connecting to MongoDB...');
    await connectDB();
    
    // Start the PumpFun monitor
    logger.info('Starting PumpFun monitor...');
    await pumpFunMonitor.start();
    
    logger.info('PumpFun monitor started successfully!');
    logger.info('Monitoring Solana mainnet for new Pump.fun token launches...');
    
    // Keep the process running
    setInterval(() => {}, 1 << 30);
    
  } catch (error) {
    logger.error('Error starting monitor:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Shutting down monitor...');
  await pumpFunMonitor.stop();
  process.exit(0);
});

// Start monitoring
startMonitoring().catch(console.error);
