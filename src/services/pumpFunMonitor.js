const { PublicKey, Connection, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const winston = require('winston');
const solanaConnection = require('../utils/solanaConnection');
const config = require('../config/config');
const Token = require('../models/token');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/pump-fun-monitor.log' })
    ]
});

class PumpFunMonitor {
    constructor() {
        this.programId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
        this.graduationThreshold = config.launchpads.pumpFun.graduationThreshold;
        
        // Polling intervals with exponential backoff
        this.pollingIntervals = {
            normal: 60000,     // 1 minute
            backoff: 120000,   // 2 minutes
            maxBackoff: 300000 // 5 minutes
        };
        
        // Cache for recent transactions and token data
        this.cache = {
            recentSignatures: new Map(),
            tokenData: new Map(),
            lastPollTime: 0,
            blockHeight: 0
        };
        
        // Track rate limiting and backoff state
        this.rateLimitState = {
            consecutiveFailures: 0,
            currentInterval: this.pollingIntervals.normal,
            lastError: null,
            lastSuccessTime: Date.now()
        };
        
        this.trackedTokens = new Map();
        this.isRunning = false;
        this.lastProcessedSlot = 0;
    }

    /**
     * Initialize the monitoring service
     */
    async initializeMonitoring() {
        try {
            await solanaConnection.initialize();
            
            // Get initial block height
            const { slot } = await solanaConnection.getSlot();
            this.lastProcessedSlot = slot;
            this.cache.blockHeight = slot;
            
            logger.info('Pump.fun monitoring service initialized successfully');
            this.startMonitoring();
        } catch (error) {
            logger.error('Failed to initialize monitoring service:', error);
            throw error;
        }
    }

    /**
     * Start monitoring for new tokens and updates
     */
    startMonitoring() {
        if (this.isRunning) {
            logger.warn('Monitoring service is already running');
            return;
        }

        this.isRunning = true;
        this.detectNewTokens();
        this.startPeriodicUpdates();
        logger.info('Pump.fun monitoring service started');
    }

    /**
     * Detect new token creations using signature-based monitoring
     */
    async detectNewTokens() {
        try {
            // Get current slot
            const { slot } = await solanaConnection.getSlot();
            
            // Get recent signatures for the program
            const signatures = await this.getRecentSignatures();
            
            // Process new signatures
            for (const signature of signatures) {
                if (this.cache.recentSignatures.has(signature)) {
                    continue; // Skip already processed signatures
                }
                
                await this.processTransaction(signature);
                this.cache.recentSignatures.set(signature, {
                    timestamp: Date.now(),
                    slot
                });
            }
            
            // Update last processed slot
            this.lastProcessedSlot = slot;
            
            // Clean up old cache entries
            this.cleanupCache();
            
            // Reset rate limit state on success
            this.resetRateLimitState();
            
            // Schedule next check with current interval
            setTimeout(() => this.detectNewTokens(), this.rateLimitState.currentInterval);
            
        } catch (error) {
            this.handleRateLimitError(error);
            setTimeout(() => this.detectNewTokens(), this.rateLimitState.currentInterval);
        }
    }

    /**
     * Get recent signatures for the program
     */
    async getRecentSignatures() {
        try {
            // Get signatures since last processed slot
            const signatures = await solanaConnection.getSignaturesForAddress(
                this.programId,
                { 
                    limit: 10,
                    before: this.lastProcessedSlot ? this.lastProcessedSlot.toString() : undefined
                }
            );
            
            return signatures.map(sig => sig.signature);
        } catch (error) {
            logger.error('Error fetching signatures:', error);
            throw error;
        }
    }

    /**
     * Process a transaction to identify new tokens
     */
    async processTransaction(signature) {
        try {
            const tx = await solanaConnection.getTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });
            
            if (!tx) return;
            
            // Check if transaction involves token creation
            if (this.isTokenCreationTransaction(tx)) {
                const tokenData = await this.extractTokenData(tx);
                if (tokenData) {
                    await this.handleNewToken(tokenData);
                }
            }
        } catch (error) {
            logger.error(`Error processing transaction ${signature}:`, error);
        }
    }

    /**
     * Check if transaction involves token creation
     */
    isTokenCreationTransaction(tx) {
        if (!tx.meta?.logMessages) return false;
        
        // Look for token creation patterns in log messages
        const creationPatterns = [
            'Program log: Instruction: Initialize',
            'Program log: Instruction: Create',
            'Program log: Creating new token',
            'Program log: Token created'
        ];
        
        return tx.meta.logMessages.some(log => 
            creationPatterns.some(pattern => log.includes(pattern))
        );
    }

    /**
     * Extract token data from transaction
     */
    async extractTokenData(tx) {
        try {
            if (!tx.meta?.logMessages) return null;
            
            // Extract token address from transaction
            const tokenAddress = this.extractTokenAddress(tx);
            if (!tokenAddress) return null;
            
            // Get token metadata
            const metadata = await this.fetchTokenMetadata(tokenAddress);
            
            return {
                mintAddress: tokenAddress,
                name: metadata.name,
                symbol: metadata.symbol,
                decimals: metadata.decimals,
                createdAt: Date.now(),
                initialPrice: this.calculateInitialPrice(tx),
                creator: tx.transaction.message.accountKeys[0].toString()
            };
        } catch (error) {
            logger.error('Error extracting token data:', error);
            return null;
        }
    }

    /**
     * Extract token address from transaction
     */
    extractTokenAddress(tx) {
        try {
            // Look for token address in account keys
            const accountKeys = tx.transaction.message.accountKeys;
            for (const key of accountKeys) {
                if (this.isTokenAccount(key)) {
                    return key.toString();
                }
            }
            return null;
        } catch (error) {
            logger.error('Error extracting token address:', error);
            return null;
        }
    }

    /**
     * Check if an account is a token account
     */
    isTokenAccount(account) {
        // Implement token account validation logic
        // This is a placeholder - actual implementation will depend on token program structure
        return account.executable === false && account.owner.equals(this.programId);
    }

    /**
     * Fetch token metadata
     */
    async fetchTokenMetadata(tokenAddress) {
        try {
            // Check cache first
            if (this.cache.tokenData.has(tokenAddress)) {
                const cached = this.cache.tokenData.get(tokenAddress);
                if (Date.now() - cached.lastUpdate < 300000) { // 5 minutes
                    return cached.metadata;
                }
            }
            
            // Fetch fresh metadata
            const metadata = await this.fetchTokenMetadataFromChain(tokenAddress);
            
            // Update cache
            this.cache.tokenData.set(tokenAddress, {
                metadata,
                lastUpdate: Date.now()
            });
            
            return metadata;
        } catch (error) {
            logger.error(`Error fetching metadata for ${tokenAddress}:`, error);
            return {
                name: 'Unknown',
                symbol: 'UNKNOWN',
                decimals: 9
            };
        }
    }

    /**
     * Calculate initial token price from transaction
     */
    calculateInitialPrice(tx) {
        try {
            // Extract price information from transaction
            // This is a placeholder - actual implementation will depend on Pump.fun's price calculation
            return 0;
        } catch (error) {
            logger.error('Error calculating initial price:', error);
            return 0;
        }
    }

    /**
     * Handle rate limit errors and implement exponential backoff
     */
    handleRateLimitError(error) {
        this.rateLimitState.consecutiveFailures++;
        this.rateLimitState.lastError = error;
        
        // Calculate backoff time
        const backoffFactor = Math.min(
            Math.pow(2, this.rateLimitState.consecutiveFailures),
            5 // Maximum backoff factor
        );
        
        this.rateLimitState.currentInterval = Math.min(
            this.pollingIntervals.normal * backoffFactor,
            this.pollingIntervals.maxBackoff
        );
        
        logger.warn(`Rate limit hit. Backing off to ${this.rateLimitState.currentInterval}ms`);
    }

    /**
     * Reset rate limit state after successful requests
     */
    resetRateLimitState() {
        this.rateLimitState.consecutiveFailures = 0;
        this.rateLimitState.currentInterval = this.pollingIntervals.normal;
        this.rateLimitState.lastError = null;
        this.rateLimitState.lastSuccessTime = Date.now();
    }

    /**
     * Clean up old cache entries
     */
    cleanupCache() {
        const now = Date.now();
        const cacheAge = 5 * 60 * 1000; // 5 minutes
        
        // Clean up recent signatures
        for (const [signature, data] of this.cache.recentSignatures) {
            if (now - data.timestamp > cacheAge) {
                this.cache.recentSignatures.delete(signature);
            }
        }
        
        // Clean up token data
        for (const [address, data] of this.cache.tokenData) {
            if (now - data.lastUpdate > cacheAge) {
                this.cache.tokenData.delete(address);
            }
        }
    }

    /**
     * Track a token's progress toward graduation
     */
    async trackTokenProgress(tokenAddress) {
        try {
            const token = this.trackedTokens.get(tokenAddress);
            if (!token) {
                logger.warn(`Token ${tokenAddress} not found in tracked tokens.`);
                return;
            }
            
            // Check cache first
            if (this.cache.tokenData.has(tokenAddress)) {
                const cachedData = this.cache.tokenData.get(tokenAddress);
                if (Date.now() - cachedData.lastUpdate < 60000) { // 1 minute cache
                    return cachedData;
                }
            }
            
            // Fetch fresh data
            const metrics = await this.fetchTokenMetrics(tokenAddress);
            
            // Update cache
            this.cache.tokenData.set(tokenAddress, {
                ...metrics,
                lastUpdate: Date.now()
            });
            
            logger.info(`Tracking progress for token ${tokenAddress}`);
            return metrics;
        } catch (error) {
            logger.error(`Error tracking token progress for ${tokenAddress}:`, error);
            throw error;
        }
    }

    /**
     * Update metrics for tracked tokens
     */
    async updateTokenMetrics() {
        const batchSize = 5; // Process tokens in small batches
        const tokens = Array.from(this.trackedTokens.entries());
        
        for (let i = 0; i < tokens.length; i += batchSize) {
            const batch = tokens.slice(i, i + batchSize);
            await Promise.all(
                batch.map(async ([mintAddress]) => {
                    try {
                        await this.trackTokenProgress(mintAddress);
                    } catch (error) {
                        logger.error(`Error updating metrics for ${mintAddress}:`, error);
                    }
                })
            );
            
            // Add delay between batches to avoid rate limits
            if (i + batchSize < tokens.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    /**
     * Start periodic updates for tracked tokens
     */
    startPeriodicUpdates() {
        setInterval(() => this.updateTokenMetrics(), this.pollingIntervals.normal);
    }

    /**
     * Stop the monitoring service
     */
    stop() {
        this.isRunning = false;
        logger.info('Pump.fun monitoring service stopped');
    }
}

// Create and export a singleton instance
const pumpFunMonitor = new PumpFunMonitor();
module.exports = pumpFunMonitor; 