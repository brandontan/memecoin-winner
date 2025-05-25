const { Connection, PublicKey } = require('@solana/web3.js');
const Token = require('../models/token');
const Transaction = require('../models/transaction');
const { calculateEnhancedScore } = require('../utils/enhancedScoring');
const logger = require('../utils/logger');
const config = require('../config');

class TokenMonitor {
  constructor() {
    this.connection = new Connection(config.solanaRpc, 'confirmed');
    this.isRunning = false;
    this.pollingInterval = null;
    this.lastProcessedSlot = 0;
    this.watchedTokens = new Set();
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Monitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting Token Monitor...');

    // Get current slot to start monitoring from
    try {
      this.lastProcessedSlot = await this.connection.getSlot();
      logger.info(`Starting from slot: ${this.lastProcessedSlot}`);
    } catch (error) {
      logger.error('Failed to get initial slot:', error);
      throw error;
    }

    // Start polling for new tokens
    this.pollingInterval = setInterval(
      () => this.checkForNewTokens(),
      config.monitorInterval || 10000 // Default to 10 seconds
    );

    // Start tracking existing tokens
    await this.initializeWatchedTokens();
  }

  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    logger.info('🛑 Token Monitor stopped');
  }

  async initializeWatchedTokens() {
    try {
      // Get all tokens from the database
      const tokens = await Token.find({}).select('mintAddress');
      tokens.forEach(token => this.watchedTokens.add(token.mintAddress));
      logger.info(`Watching ${tokens.length} existing tokens`);
    } catch (error) {
      logger.error('Error initializing watched tokens:', error);
    }
  }

  async checkForNewTokens() {
    if (!this.isRunning) return;

    try {
      const currentSlot = await this.connection.getSlot();
      
      if (currentSlot <= this.lastProcessedSlot) {
        return; // No new slots to process
      }

      // Get recent signatures for Pump.fun program
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(config.pumpFunProgram),
        { 
          limit: 50,
          until: this.lastProcessedSlot.toString()
        }
      );

      logger.debug(`Found ${signatures.length} new transactions`);

      // Process transactions in reverse order (oldest first)
      for (let i = signatures.length - 1; i >= 0; i--) {
        const sigInfo = signatures[i];
        if (sigInfo.err) continue;
        
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
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (!tx || !tx.meta || tx.meta.err) return;

      // Look for token creation or trade events
      const tokenData = this.extractTokenData(tx);
      
      if (tokenData) {
        await this.handleTokenData(tokenData, tx);
      }

    } catch (error) {
      logger.error(`Error processing transaction ${signature}:`, error);
    }
  }

  extractTokenData(transaction) {
    try {
      const instructions = transaction.transaction.message.instructions;
      const accountKeys = transaction.transaction.message.accountKeys.map(k => k.toString());
      
      // Check for token creation
      for (const instruction of instructions) {
        if (instruction.program === 'spl-token' && instruction.parsed?.type === 'initializeMint') {
          const mintAddress = instruction.parsed.info.mint;
          
          // Extract creator from the first signer
          const creator = accountKeys[0];
          
          return {
            type: 'TOKEN_CREATE',
            mintAddress,
            creator,
            timestamp: new Date(transaction.blockTime * 1000),
            transaction: transaction.transaction.signatures[0]
          };
        }
      }
      
      // Check for token transfers (trades)
      for (const instruction of instructions) {
        if (instruction.program === 'spl-token' && instruction.parsed?.type === 'transfer') {
          const mintAddress = instruction.parsed.info.source;
          const from = instruction.parsed.info.authority;
          const to = instruction.parsed.info.destination;
          const amount = instruction.parsed.info.amount;
          
          return {
            type: 'TOKEN_TRANSFER',
            mintAddress,
            from,
            to,
            amount,
            timestamp: new Date(transaction.blockTime * 1000),
            transaction: transaction.transaction.signatures[0]
          };
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error extracting token data:', error);
      return null;
    }
  }

  async handleTokenData(tokenData, tx) {
    try {
      if (tokenData.type === 'TOKEN_CREATE') {
        await this.handleNewToken(tokenData);
      } else if (tokenData.type === 'TOKEN_TRANSFER') {
        await this.handleTokenTransfer(tokenData);
      }
    } catch (error) {
      logger.error('Error handling token data:', error);
    }
  }

  async handleNewToken(tokenData) {
    try {
      // Skip if we're already tracking this token
      if (this.watchedTokens.has(tokenData.mintAddress)) {
        return;
      }

      logger.info(`New token detected: ${tokenData.mintAddress}`);
      
      // Fetch token metadata
      const metadata = await this.fetchTokenMetadata(tokenData.mintAddress);
      
      // Create new token in database
      const token = new Token({
        mintAddress: tokenData.mintAddress,
        name: metadata?.name || 'Unknown',
        symbol: metadata?.symbol || 'UNKNOWN',
        creator: tokenData.creator,
        launchTime: tokenData.timestamp,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        score: 0,
        scoreComponents: {},
        isActive: true
      });

      await token.save();
      this.watchedTokens.add(tokenData.mintAddress);
      
      logger.info(`Added new token: ${token.name} (${token.symbol}) - ${token.mintAddress}`);
      
      // Send notification for new token
      this.sendNotification({
        type: 'NEW_TOKEN',
        token: {
          mintAddress: token.mintAddress,
          name: token.name,
          symbol: token.symbol,
          creator: token.creator
        },
        timestamp: new Date()
      });
      
    } catch (error) {
      logger.error('Error handling new token:', error);
    }
  }

  async handleTokenTransfer(transferData) {
    try {
      // Skip if we're not tracking this token
      if (!this.watchedTokens.has(transferData.mintAddress)) {
        return;
      }

      // Record the transaction
      const transaction = new Transaction({
        signature: transferData.transaction,
        tokenAddress: transferData.mintAddress,
        from: transferData.from,
        to: transferData.to,
        amount: transferData.amount,
        timestamp: transferData.timestamp,
        type: transferData.amount > 0 ? 'BUY' : 'SELL'
      });

      await transaction.save();
      
      // Update token metrics and score
      await this.updateTokenScore(transferData.mintAddress);
      
    } catch (error) {
      logger.error('Error handling token transfer:', error);
    }
  }

  async updateTokenScore(mintAddress) {
    try {
      const token = await Token.findOne({ mintAddress });
      if (!token) return;

      // Get recent transactions for this token
      const transactions = await Transaction.find({ 
        tokenAddress: mintAddress,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      });

      // Calculate enhanced score
      const enhancedScore = calculateEnhancedScore(token, transactions);
      
      // Update token with new score
      token.score = enhancedScore.score;
      token.scoreComponents = enhancedScore.components;
      token.lastUpdated = new Date();
      
      await token.save();
      
      // Log significant score changes
      if (token.score >= 80) {
        logger.info(`🚨 High scoring token detected: ${token.name} (${token.symbol}) - Score: ${token.score}`);
        this.sendNotification({
          type: 'HIGH_SCORE',
          token: {
            mintAddress: token.mintAddress,
            name: token.name,
            symbol: token.symbol,
            score: token.score
          },
          timestamp: new Date()
        });
      }
      
    } catch (error) {
      logger.error(`Error updating score for token ${mintAddress}:`, error);
    }
  }

  async fetchTokenMetadata(mintAddress) {
    // Implement token metadata fetching from on-chain or API
    // This is a placeholder implementation
    try {
      // In a real implementation, this would fetch from:
      // 1. On-chain metadata (Metaplex)
      // 2. External APIs (Birdeye, Solscan, etc.)
      // 3. Cache results
      
      return {
        name: 'New Token',
        symbol: 'NEW',
        decimals: 9,
        // ... other metadata
      };
    } catch (error) {
      logger.error(`Error fetching metadata for ${mintAddress}:`, error);
      return null;
    }
  }

  sendNotification(notification) {
    // Implement notification system (webhooks, websockets, etc.)
    // This is a placeholder implementation
    logger.info('Notification:', JSON.stringify(notification, null, 2));
    
    // In a real implementation, this would:
    // 1. Send WebSocket updates to connected clients
    // 2. Trigger push notifications
    // 3. Log to monitoring system
  }
}

module.exports = new TokenMonitor();
