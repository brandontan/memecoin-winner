import { Connection, PublicKey, ParsedTransactionWithMeta, ConfirmedSignatureInfo, RpcResponseAndContext, TokenAmount, GetVersionedTransactionConfig, Finality } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Recorded responses for replay
const recordedResponses: Record<string, any> = {};

// Configurable delay and error injection
interface MockConfig {
  delay?: number;
  shouldFail?: boolean;
  errorMessage?: string;
  rateLimit?: boolean;
}

export class MockSolanaConnection extends Connection {
  private config: MockConfig;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private static debugMode: boolean = process.env.DEBUG_MOCKS === 'true';
  static responses: Map<string, any> = new Map();
  static rateLimitEnabled: boolean = false;
  static shouldFail: boolean = false;
  static errorMessage: string = '';
  static requestCount: number = 0;

  constructor(endpoint: string, config: MockConfig = {}) {
    super(endpoint);
    this.config = config;
    MockSolanaConnection.rateLimitEnabled = config.rateLimit || false;
    MockSolanaConnection.shouldFail = config.shouldFail || false;
    MockSolanaConnection.errorMessage = config.errorMessage || '';
    MockSolanaConnection.requestCount = 0;
  }

  private static logDebug(message: string, data?: any) {
    if (MockSolanaConnection.debugMode) {
      console.log(`[MockSolanaConnection] ${message}`, data || '');
    }
  }

  private getMockKey(method: string, params: any[]): string {
    // Normalize params to handle commitment levels consistently
    const normalizedParams = params.map(param => {
      if (typeof param === 'object' && param !== null) {
        if ('commitment' in param) {
          return { ...param, commitment: param.commitment || 'finalized' };
        }
        if (param instanceof PublicKey) {
          return param.toString();
        }
      }
      return param;
    });
    const key = `${method}_${JSON.stringify(normalizedParams)}`;
    MockSolanaConnection.logDebug('Generated mock key:', key);
    return key;
  }

  private async simulateNetworkDelay(): Promise<void> {
    if (this.config.delay) {
      await new Promise(resolve => setTimeout(resolve, this.config.delay));
    }
  }

  private checkRateLimit(): void {
    if (MockSolanaConnection.rateLimitEnabled && MockSolanaConnection.requestCount > 0) {
      throw new Error('Rate limit exceeded');
    }
    MockSolanaConnection.requestCount++;
  }

  private async handleRequest<T>(operation: () => Promise<T>): Promise<T> {
    await this.simulateNetworkDelay();

    if (MockSolanaConnection.shouldFail) {
      throw new Error(MockSolanaConnection.errorMessage || 'Network error');
    }

    this.checkRateLimit();

    try {
      return await operation();
    } catch (error) {
      if (MockSolanaConnection.rateLimitEnabled && MockSolanaConnection.requestCount > 1) {
        throw new Error('Rate limit exceeded');
      }
      throw error;
    }
  }

  async getParsedTransaction(
    signature: string,
    commitmentOrConfig?: GetVersionedTransactionConfig | Finality
  ): Promise<ParsedTransactionWithMeta | null> {
    return this.handleRequest(async () => {
      const commitment = typeof commitmentOrConfig === 'string' 
        ? commitmentOrConfig 
        : commitmentOrConfig?.commitment || 'finalized';
      const key = this.getMockKey('getParsedTransaction', [signature, { commitment }]);
      const response = MockSolanaConnection.responses.get(key);
      if (response) {
        return response;
      }
      return null;
    });
  }

  async getSlot(): Promise<number> {
    return this.handleRequest(async () => {
      const key = 'getSlot';
      const response = MockSolanaConnection.responses.get(key);
      if (response) {
        return response;
      }
      return 1;
    });
  }

  async getSignaturesForAddress(
    address: PublicKey,
    options?: { until?: string }
  ): Promise<ConfirmedSignatureInfo[]> {
    return this.handleRequest(async () => {
      const key = this.getMockKey('getSignaturesForAddress', [address, options]);
      const response = MockSolanaConnection.responses.get(key);
      if (response) {
        return response;
      }
      return [];
    });
  }

  async getTokenSupply(
    tokenAddress: PublicKey
  ): Promise<RpcResponseAndContext<TokenAmount>> {
    return this.handleRequest(async () => {
      const key = this.getMockKey('getTokenSupply', [tokenAddress]);
      const response = MockSolanaConnection.responses.get(key);
      if (response) {
        return response;
      }
      return {
        context: { slot: 1 },
        value: { amount: '1000000', decimals: 9, uiAmount: 1 }
      };
    });
  }

  // Method to record responses for replay
  static recordResponse(method: string, params: any[], response: any): void {
    const key = `${method}_${JSON.stringify(params)}`;
    MockSolanaConnection.logDebug('Recording mock response for key:', key);
    MockSolanaConnection.responses.set(key, response);
  }

  // Method to clear recorded responses
  static clearRecordedResponses(): void {
    MockSolanaConnection.logDebug('Clearing all recorded responses');
    MockSolanaConnection.responses.clear();
  }

  static resetRateLimitState() {
    MockSolanaConnection.requestCount = 0;
  }
} 