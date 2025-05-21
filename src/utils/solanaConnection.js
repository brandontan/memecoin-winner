const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const winston = require('winston');
const config = require('../config/config');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/solana-connection.log' })
    ]
});

// Known program IDs
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

class SolanaConnection {
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.retryAttempts = 0;
        this.maxRetries = config.monitoring.maxRetries;
        this.retryDelay = config.monitoring.retryDelay;
        this.fallbackEndpoints = [
            clusterApiUrl('mainnet-beta'),
            'https://solana-api.projectserum.com',
            'https://rpc.ankr.com/solana'
        ];
        this.isPublicRPC = true;
        this.supportsProgramAccounts = null;
    }

    /**
     * Establishes a connection to the Solana blockchain with fallback support
     * @returns {Promise<Connection>} The Solana connection instance
     */
    async initialize() {
        try {
            this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
            await this.testConnection();
            this.isConnected = true;
            this.retryAttempts = 0;
            this.isPublicRPC = this.isPublicEndpoint(config.solana.rpcUrl);
            logger.info('Successfully connected to Solana network');
            return this.connection;
        } catch (error) {
            logger.error('Failed to connect to primary endpoint:', error);
            return await this.tryFallbackEndpoints();
        }
    }

    /**
     * Checks if the endpoint is a public RPC
     * @param {string} endpoint - The RPC endpoint URL
     * @returns {boolean} True if the endpoint is a public RPC
     */
    isPublicEndpoint(endpoint) {
        const publicEndpoints = [
            'api.mainnet-beta.solana.com',
            'solana-api.projectserum.com',
            'rpc.ankr.com'
        ];
        return publicEndpoints.some(publicEndpoint => endpoint.includes(publicEndpoint));
    }

    /**
     * Attempts to connect to fallback endpoints if primary connection fails
     * @returns {Promise<Connection>} The Solana connection instance
     */
    async tryFallbackEndpoints() {
        for (const endpoint of this.fallbackEndpoints) {
            try {
                logger.info(`Attempting to connect to fallback endpoint: ${endpoint}`);
                this.connection = new Connection(endpoint, 'confirmed');
                await this.testConnection();
                this.isConnected = true;
                this.retryAttempts = 0;
                this.isPublicRPC = this.isPublicEndpoint(endpoint);
                logger.info(`Successfully connected to fallback endpoint: ${endpoint}`);
                return this.connection;
            } catch (error) {
                logger.error(`Failed to connect to fallback endpoint ${endpoint}:`, error);
            }
        }
        throw new Error('All connection attempts failed');
    }

    /**
     * Tests the connection's responsiveness
     * @returns {Promise<boolean>} True if connection is responsive
     */
    async testConnection() {
        try {
            await this.connection.getVersion();
            return true;
        } catch (error) {
            throw new Error(`Connection test failed: ${error.message}`);
        }
    }

    /**
     * Fetches account information with automatic retries
     * @param {PublicKey} publicKey - The account's public key
     * @returns {Promise<Object>} Account information
     */
    async getAccountInfo(publicKey) {
        return await this.withRetry(async () => {
            const accountInfo = await this.connection.getAccountInfo(publicKey);
            if (!accountInfo) {
                throw new Error(`Account not found: ${publicKey.toString()}`);
            }
            return accountInfo;
        });
    }

    /**
     * Checks if the RPC endpoint supports getProgramAccounts
     * @returns {Promise<boolean>} True if getProgramAccounts is supported
     */
    async isProgramAccountsSupported() {
        if (this.supportsProgramAccounts !== null) {
            return this.supportsProgramAccounts;
        }

        try {
            // Test with a minimal request that should work if the method is supported
            await this.connection.getProgramAccounts(
                TOKEN_PROGRAM_ID,
                {
                    dataSlice: { offset: 0, length: 0 },
                    limit: 1
                }
            );
            this.supportsProgramAccounts = true;
            return true;
        } catch (error) {
            if (error.message.includes('disabled') || 
                error.message.includes('410') || 
                error.message.includes('not supported')) {
                this.supportsProgramAccounts = false;
                return false;
            }
            // If it's some other error, assume the method might still be supported
            this.supportsProgramAccounts = true;
            return true;
        }
    }

    /**
     * Fetches program accounts with optimized filtering
     * @param {PublicKey} programId - The program's public key
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of account information
     */
    async getProgramAccounts(programId, options = {}) {
        if (this.isPublicRPC) {
            logger.warn('Using public RPC endpoint. getProgramAccounts may be limited or unavailable.');
            logger.info('Consider using a dedicated RPC provider for production use.');
        }

        // Check if the method is supported
        const isSupported = await this.isProgramAccountsSupported();
        if (!isSupported) {
            throw new Error(
                'getProgramAccounts is not supported by this RPC endpoint. ' +
                'Please use a dedicated RPC provider that supports this method.'
            );
        }

        return await this.withRetry(async () => {
            try {
                // Use optimized filters for public RPCs
                const filters = this.isPublicRPC ? [
                    { dataSize: 165 }, // Example: filter by account size
                    { memcmp: { offset: 0, bytes: programId.toBase58().slice(0, 8) } } // Example: filter by program ID prefix
                ] : options.filters;

                return await this.connection.getProgramAccounts(programId, {
                    ...options,
                    filters: filters,
                    commitment: 'confirmed'
                });
            } catch (error) {
                if (error.message.includes('410')) {
                    throw new Error(
                        'getProgramAccounts failed: RPC endpoint does not support this operation. ' +
                        'Please use a dedicated RPC provider for production use.'
                    );
                }
                throw error;
            }
        });
    }

    /**
     * Gets the current slot
     * @returns {Promise<number>} Current slot number
     */
    async getSlot() {
        return await this.withRetry(async () => {
            return await this.connection.getSlot();
        });
    }

    /**
     * Gets token accounts for a wallet
     * @param {PublicKey} owner - The wallet's public key
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of token accounts
     */
    async getTokenAccountsByOwner(owner, options = {}) {
        return await this.withRetry(async () => {
            try {
                const response = await this.connection.getTokenAccountsByOwner(
                    owner,
                    { programId: TOKEN_PROGRAM_ID, ...options }
                );
                return response.value;
            } catch (error) {
                logger.error('Failed to get token accounts:', error);
                throw error;
            }
        });
    }

    /**
     * Subscribes to account changes
     * @param {PublicKey} publicKey - The account to subscribe to
     * @param {Function} callback - Callback function for account changes
     * @returns {number} Subscription ID
     */
    subscribeToAccount(publicKey, callback) {
        try {
            return this.connection.onAccountChange(
                publicKey,
                (accountInfo, context) => {
                    callback(accountInfo, context);
                },
                'confirmed'
            );
        } catch (error) {
            logger.error('Failed to subscribe to account:', error);
            throw error;
        }
    }

    /**
     * Executes a function with retry logic and exponential backoff
     * @param {Function} fn - Function to execute
     * @returns {Promise<any>} Function result
     */
    async withRetry(fn) {
        while (this.retryAttempts < this.maxRetries) {
            try {
                return await fn();
            } catch (error) {
                this.retryAttempts++;
                const delay = this.retryDelay * Math.pow(2, this.retryAttempts - 1);
                
                logger.warn(`Attempt ${this.retryAttempts} failed, retrying in ${delay}ms:`, error);
                
                if (this.retryAttempts === this.maxRetries) {
                    throw new Error(`Max retries (${this.maxRetries}) exceeded: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Gets the current connection status
     * @returns {Object} Connection status information
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            endpoint: this.connection?.rpcEndpoint,
            retryAttempts: this.retryAttempts,
            maxRetries: this.maxRetries,
            isPublicRPC: this.isPublicRPC
        };
    }
}

// Create and export a singleton instance
const solanaConnection = new SolanaConnection();
module.exports = solanaConnection; 