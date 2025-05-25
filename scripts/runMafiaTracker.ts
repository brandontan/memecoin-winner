import { Connection } from '@solana/web3.js';
import { MafiaTracker } from '../src/services/mafiaTracker';
import { logger } from '../src/utils/logger';
import config from '../config';

// Initialize connection
const connection = new Connection(config.solanaRpc, 'confirmed');
const tracker = new MafiaTracker(connection);

// Subscribe to alerts
tracker.subscribeToAlert((alert) => {
  logger.info('\n🚨 NEW ALERT 🚨');
  logger.info(`Type: ${alert.type}`);
  logger.info(`Token: ${alert.tokenSymbol || alert.token}`);
  logger.info(`Wallet: ${alert.wallet}`);
  logger.info(`Confidence: ${alert.confidence}`);
  logger.info('Details:', alert.details);
  
  // In a real implementation, you might want to:
  // 1. Send a notification (Discord, Telegram, etc.)
  // 2. Trigger additional analysis
  // 3. Add to a dashboard
});

// Run monitoring in a loop
async function monitorLoop() {
  try {
    logger.info('Starting mafia wallet monitoring loop...');
    await tracker.monitorMafiaActivity();
  } catch (error) {
    logger.error('Error in monitoring loop:', error);
  }
  
  // Run every 5 minutes
  setTimeout(monitorLoop, 5 * 60 * 1000);
}

// Start monitoring
monitorLoop().catch(console.error);

// Handle process termination
process.on('SIGINT', () => {
  logger.info('Stopping mafia tracker...');
  process.exit(0);
});
