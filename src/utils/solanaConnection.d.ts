import { Connection, PublicKey, GetTransactionConfig } from '@solana/web3.js';

export interface SignatureInfo {
    signature: string;
}

export class SolanaConnection {
    private connection: Connection | null;
    private isInitialized: boolean;

    constructor();
    initialize(): Promise<void>;
    getSlot(): Promise<{ slot: number }>;
    getTransaction(signature: string, options?: GetTransactionConfig): Promise<any>;
    getSignaturesForAddress(
        address: string,
        options?: { limit?: number; before?: string }
    ): Promise<SignatureInfo[]>;
    getConnection(): Connection;
}

export const solanaConnection: SolanaConnection; 