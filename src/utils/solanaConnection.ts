import { Connection, ConnectionConfig, PublicKey, GetTransactionConfig } from '@solana/web3.js';
import logger from './logger';
import { config } from '../config/config';

class SolanaConnection {
    private connection: Connection | null = null;
    private isInitialized: boolean = false;

    constructor() {
        this.connection = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the Solana connection
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            const connectionConfig: ConnectionConfig = {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 60000,
                wsEndpoint: config.solana.wsEndpoint
            };

            this.connection = new Connection(
                config.solana.rpcEndpoint,
                connectionConfig
            );

            // Test the connection
            await this.connection.getVersion();
            this.isInitialized = true;
            logger.info('Solana connection initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Solana connection:', error);
            throw error;
        }
    }

    /**
     * Get the current slot
     */
    async getSlot(): Promise<{ slot: number }> {
        if (!this.connection) {
            throw new Error('Solana connection not initialized');
        }

        const slot = await this.connection.getSlot();
        return { slot };
    }

    /**
     * Get transaction details
     */
    async getTransaction(signature: string, options?: GetTransactionConfig): Promise<any> {
        if (!this.connection) {
            throw new Error('Solana connection not initialized');
        }

        return this.connection.getTransaction(signature, options);
    }

    /**
     * Get signatures for an address
     */
    async getSignaturesForAddress(address: string, options?: { limit?: number; before?: string }): Promise<Array<{ signature: string }>> {
        if (!this.connection) {
            throw new Error('Solana connection not initialized');
        }

        return this.connection.getSignaturesForAddress(
            new PublicKey(address),
            options
        );
    }

    /**
     * Get the connection instance
     */
    getConnection(): Connection {
        if (!this.connection) {
            throw new Error('Solana connection not initialized');
        }

        return this.connection;
    }
}

export const solanaConnection = new SolanaConnection(); 