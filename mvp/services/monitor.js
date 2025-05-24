const { Connection, PublicKey } = require('@solana/web3.js');
const Token = require('../models/token');
const logger = require('../utils/logger');
const config = require('../config');

class PumpFunMonitor {
  constructor() {
    this.connection = new Connection(config.solanaRpc, 'confirmed');
    this.isRunning = false;
    this.intervalId = null;
    this.lastProcessedSlot = 0;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Monitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting Pump.fun monitor...');

    // Get current slot to start monitoring from
    this.lastProcessedSlot = await this.connection.getSlot();
    
    // Start monitoring loop
    this.intervalId = setInterval(() => {
      this.checkForNewTokens();
    }, config.monitorInterval);

    logger.info(`Monitor started. Checking every ${config.monitorInterval}ms`);
  }

  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    logger.info('Monitor stopped');
  }

  async checkForNewTokens() {
    try {
      const currentSlot = await this.connection.getSlot();
      
      if (currentSlot <= this.lastProcessedSlot) {
        return; // No new slots to process
      }

      // Get recent signatures for Pump.fun program
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(config.pumpFunProgram),
        { limit: 50, until: this.lastProcessedSlot.toString() }
      );

      logger.info(`Found ${signatures.length} new transactions`);

      for (const sigInfo of signatures) {
        if (sigInfo.err) continue; // Skip failed transactions
        
        await this.processTransaction(sigInfo.signature);
      }

      this.lastProcessedSlot = currentSlot;

    } catch (error) {
      logger.error('Error checking for new tokens:', error);
    }
  }

  async processTransaction(signature) {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!tx || !tx.meta || tx.meta.err) return;

      // Look for token creation pattern in instructions
      const tokenData = this.extractTokenCreation(tx);
      
      if (tokenData) {
        await this.saveNewToken(tokenData);
      }

    } catch (error) {
      logger.error(`Error processing transaction ${signature}:`, error);
    }
  }

  extractTokenCreation(transaction) {
    try {
      const instructions = transaction.transaction.message.instructions;
      
      // Look for create token instruction pattern
      for (const instruction of instructions) {
        if (instruction.program === 'spl-token' && instruction.parsed?.type === 'initializeMint') {
          const mintAddress = instruction.parsed.info.mint;
          
          // Extract basic token info from transaction logs
          const logs = transaction.meta.logMessages || [];
          const tokenInfo = this.parseTokenInfoFromLogs(logs);
          
          if (tokenInfo) {
            return {
              address: mintAddress,
              name: tokenInfo.name || 'Unknown Token',
              symbol: tokenInfo.symbol || 'UNKNOWN',
              creator: transaction.transaction.message.accountKeys[0].pubkey.toString(),
              launchTime: new Date(transaction.blockTime * 1000)
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error extracting token creation:', error);
      return null;
    }
  }

  parseTokenInfoFromLogs(logs) {
    // Simple pattern matching for token metadata in logs
    // This is a simplified version - real implementation would be more robust
    for (const log of logs) {
      if (log.includes('Create') && log.includes('Token')) {
        // Extract name and symbol using regex patterns
        const nameMatch = log.match(/name[:\s]+([^,\s]+)/i);
        const symbolMatch = log.match(/symbol[:\s]+([^,\s]+)/i);
        
        return {
          name: nameMatch ? nameMatch[1] : null,
          symbol: symbolMatch ? symbolMatch[1] : null
        };
      }
    }
    return null;
  }

  async saveNewToken(tokenData) {
    try {
      // Check if token already exists
      const existingToken = await Token.findOne({ address: tokenData.address });
      if (existingToken) {
        return; // Already tracking this token
      }

      // Create new token
      const token = new Token(tokenData);
      await token.save();

      logger.info(`New token detected: ${token.name} (${token.symbol}) - ${token.address}`);
      
      // Start tracking this token's metrics
      this.startTrackingToken(token);

    } catch (error) {
      logger.error('Error saving new token:', error);
    }
  }

  async startTrackingToken(token) {
    // This would typically connect to a DEX API to get real-time trading data
    // For MVP, we'll simulate some basic metrics
    
    try {
      // Simulate getting trading metrics (replace with real API calls)
      const metrics = await this.getTokenMetrics(token.address);
      
      token.volume = metrics.volume || 0;
      token.buyers = metrics.buyers || 0;
      token.priceUSD = metrics.price || 0;
      
      // Calculate score
      token.calculateScore();
      
      await token.save();
      
      // Check if should alert
      if (token.shouldAlert()) {
        this.sendAlert(token);
      }

    } catch (error) {
      logger.error(`Error tracking token ${token.address}:`, error);
    }
  }

  async getTokenMetrics(tokenAddress) {
    // Placeholder for real DEX API integration
    // In production, this would call Jupiter, Birdeye, or direct DEX APIs
    
    return {
      volume: Math.random() * 10000, // Simulated volume
      buyers: Math.floor(Math.random() * 100), // Simulated buyer count
      price: Math.random() * 0.01 // Simulated price in USD
    };
  }

  sendAlert(token) {
    logger.info(`🚨 ALERT: High-potential token detected!`);
    logger.info(`   Name: ${token.name} (${token.symbol})`);
    logger.info(`   Score: ${token.score}/100`);
    logger.info(`   Address: ${token.address}`);
    logger.info(`   Volume: $${token.volume.toLocaleString()}`);
    logger.info(`   Buyers: ${token.buyers}`);
    
    // Mark alert as sent
    token.markAlertSent();
    
    // In production, this would send push notifications, emails, etc.
  }
}

module.exports = new PumpFunMonitor();