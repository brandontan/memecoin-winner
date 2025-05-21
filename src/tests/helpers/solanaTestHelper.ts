import { Connection, PublicKey } from '@solana/web3.js';
import { MockSolanaConnection } from '../mocks/solanaRpcMock';
import { config } from '../../config/config';

interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

interface MockConfig {
  delay?: number;
  shouldFail?: boolean;
  errorMessage?: string;
  rateLimit?: boolean;
}

export class SolanaTestHelper {
  private static defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  };

  static async withRetry<T>(
    operation: () => Promise<T>,
    retryConfig: Partial<RetryConfig> = {}
  ): Promise<T> {
    const config = { ...this.defaultRetryConfig, ...retryConfig };
    let lastError: Error | null = null;
    let delay = config.initialDelay;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt === config.maxAttempts) break;
        
        // Exponential backoff with jitter
        const jitter = Math.random() * 0.1 * delay;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        delay = Math.min(delay * config.backoffFactor, config.maxDelay);
      }
    }

    throw lastError;
  }

  static createMockConnection(mockConfig: MockConfig = {}): MockSolanaConnection {
    return new MockSolanaConnection(config.solana.rpcEndpoint, mockConfig);
  }

  static createRealConnection(): Connection {
    return new Connection(config.solana.rpcEndpoint, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
  }

  static async recordRealResponses(
    connection: Connection,
    signatures: string[]
  ): Promise<void> {
    for (const signature of signatures) {
      const tx = await connection.getParsedTransaction(signature);
      if (tx) {
        MockSolanaConnection.recordResponse('getParsedTransaction', [signature], tx);
      }
    }
  }

  static async verifyConnection(connection: Connection): Promise<boolean> {
    try {
      await this.withRetry(async () => {
        const slot = await connection.getSlot();
        if (slot <= 0) throw new Error('Invalid slot number');
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  static async waitForConfirmation(
    connection: Connection,
    signature: string,
    timeout = 60000
  ): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const status = await connection.getSignatureStatus(signature);
        if (status?.value?.confirmationStatus === 'confirmed') {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        // Continue waiting on error
      }
    }
    return false;
  }
} 