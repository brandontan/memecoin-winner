const database = require('./utils/database');
const monitor = require('./services/monitor');
const scorer = require('./services/scorer');
const logger = require('./utils/logger');
const config = require('./config');

class MemecoinPredictor {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    try {
      logger.info('🚀 Starting Memecoin Predictor MVP...');

      // Connect to database
      await database.connect();
      logger.info('✅ Database connected');

      // Start monitoring service
      await monitor.start();
      logger.info('✅ Monitor started');

      // Start scoring service
      scorer.start();
      logger.info('✅ Scorer started');

      this.isRunning = true;
      logger.info('🎯 Memecoin Predictor MVP is running!');
      logger.info(`📊 Alert threshold: ${config.alertThreshold}/100`);
      logger.info(`⏱️  Monitoring interval: ${config.monitorInterval}ms`);

    } catch (error) {
      logger.error('❌ Failed to start application:', error);
      process.exit(1);
    }
  }

  async stop() {
    if (!this.isRunning) return;

    logger.info('🛑 Shutting down Memecoin Predictor...');

    try {
      // Stop services
      await monitor.stop();
      scorer.stop();
      
      // Disconnect database
      await database.disconnect();
      
      this.isRunning = false;
      logger.info('👋 Shutdown complete');
      
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }
}

const app = new MemecoinPredictor();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal');
  await app.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal');
  await app.stop();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Promise Rejection:', error);
  app.stop().then(() => process.exit(1));
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  app.stop().then(() => process.exit(1));
});

// Start the application
app.start();

module.exports = app;