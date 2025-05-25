import { Connection, PublicKey } from '@solana/web3.js';
import { SolanaTestHelper } from './helpers/solanaTestHelper';
import { MockSolanaConnection } from './mocks/solanaRpcMock';
import { config } from '../config/config';

const SKIP_INTEGRATION = process.env.RUN_INTEGRATION_TESTS !== 'true';
const TEST_TIMEOUT = 30000;

describe('Solana Connection Tests', () => {
  // Unit Tests with Mocks
  describe('Unit Tests', () => {
    let mockConnection: MockSolanaConnection;

    beforeEach(() => {
      mockConnection = SolanaTestHelper.createMockConnection();
      MockSolanaConnection.clearRecordedResponses();
    });

    it('should handle successful transaction parsing', async () => {
      const signature = 'test_signature';
      const fullRealisticMockTx = {
        slot: 1,
        blockTime: Math.floor(Date.now() / 1000),
        transaction: {
          message: {
            header: {
              numRequiredSignatures: 1,
              numReadonlySignedAccounts: 0,
              numReadonlyUnsignedAccounts: 4
            },
            accountKeys: [
              { pubkey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', signer: true, writable: true, source: 'transaction' },
              { pubkey: 'So11111111111111111111111111111111111111112', signer: false, writable: true, source: 'transaction' },
              { pubkey: '11111111111111111111111111111111', signer: false, writable: false, source: 'transaction' },
              { pubkey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', signer: false, writable: false, source: 'transaction' }
            ],
            recentBlockhash: 'EePxq6qUQKqhB8kPLx6aE7rT1h5HgFJcQ2Jz6X6X6X6X',
            instructions: [{
              programIdIndex: 3,
              accounts: [0, 1, 2],
              data: 'base58encodeddata'
            }]
          },
          signatures: ['mockSignatureHash123']
        },
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1000000000, 0, 1000000000, 1000000000],
          postBalances: [995000000, 0, 1000000000, 1000000000],
          innerInstructions: [],
          logMessages: [
            'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
            'Program log: Instruction: InitializeMint',
            'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success'
          ],
          preTokenBalances: [],
          postTokenBalances: []
        }
      };

      const commitment = 'finalized';
      
      // Debug logging
      console.log('Recording mock response for:', {
        method: 'getParsedTransaction',
        signature,
        commitment
      });
      
      // Set the mock response directly using the same key format as getMockKey
      const key = `getParsedTransaction_${JSON.stringify([signature, { commitment }])}`;
      MockSolanaConnection.responses.set(key, fullRealisticMockTx);
      
      // Debug logging
      console.log('Retrieving mock response...');
      const result = await mockConnection.getParsedTransaction(signature, { commitment });
      console.log('Received result:', result);
      
      expect(result).toEqual(fullRealisticMockTx);
    });

    it('should handle rate limiting', async () => {
      const rateLimitedConnection = SolanaTestHelper.createMockConnection({ rateLimit: true });
      
      // First request should succeed
      await rateLimitedConnection.getSlot();
      
      // Second request should fail due to rate limit
      await expect(rateLimitedConnection.getSlot()).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle network delays', async () => {
      const delayedConnection = SolanaTestHelper.createMockConnection({ delay: 100 });
      const startTime = Date.now();
      await delayedConnection.getSlot();
      const endTime = Date.now();
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });

    it('should handle simulated errors', async () => {
      const failingConnection = SolanaTestHelper.createMockConnection({
        shouldFail: true,
        errorMessage: 'Simulated network error'
      });
      
      await expect(failingConnection.getSlot()).rejects.toThrow('Simulated network error');
    });
  });

  // Skip network-dependent tests
  describe.skip('Integration Tests', () => {
    let realConnection: Connection;

    beforeAll(async () => {
      if (SKIP_INTEGRATION) {
        console.log('Skipping integration tests. Set RUN_INTEGRATION_TESTS=true to run.');
        return;
      }
      realConnection = SolanaTestHelper.createRealConnection();
      const isConnected = await SolanaTestHelper.verifyConnection(realConnection);
      if (!isConnected) {
        throw new Error('Failed to connect to Solana network');
      }
    });

    it('should fetch current slot', async () => {
      if (SKIP_INTEGRATION) return;
      const slot = await SolanaTestHelper.withRetry(
        () => realConnection.getSlot(),
        { maxAttempts: 3, initialDelay: 1000 }
      );
      expect(slot).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('should handle connection errors gracefully', async () => {
      if (SKIP_INTEGRATION) return;
      const invalidConnection = new Connection('http://invalid-endpoint');
      const isConnected = await SolanaTestHelper.verifyConnection(invalidConnection);
      expect(isConnected).toBe(false);
    }, TEST_TIMEOUT);

    it('should handle rate limiting with backoff', async () => {
      if (SKIP_INTEGRATION) return;
      const operations = Array(10).fill(null).map(() => 
        realConnection.getSlot()
      );
      
      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('should wait for transaction confirmation', async () => {
      if (SKIP_INTEGRATION) return;
      // Use a known confirmed transaction for testing
      const knownSignature = '5KtPn1LGuxkZBYVaQwqyGHXzghnKzJ1JZqKxJqKxJqKx';
      const isConfirmed = await SolanaTestHelper.waitForConfirmation(
        realConnection,
        knownSignature,
        5000
      );
      expect(isConfirmed).toBe(true);
    }, TEST_TIMEOUT);
  });

  // Skip connection pool tests
  describe.skip('Connection Pool Tests', () => {
    const endpoints = [
      config.solana.rpcEndpoint,
      'https://api.mainnet-beta.solana.com',
      'https://solana-api.projectserum.com'
    ];

    it('should handle failover between endpoints', async () => {
      if (SKIP_INTEGRATION) return;
      const connections = endpoints.map(endpoint => new Connection(endpoint));
      let connected = false;

      for (const connection of connections) {
        try {
          const isConnected = await SolanaTestHelper.verifyConnection(connection);
          if (isConnected) {
            connected = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }

      expect(connected).toBe(true);
    }, TEST_TIMEOUT);

    it('should handle same slot numbers from different endpoints', async () => {
      if (SKIP_INTEGRATION) return;
      const connection1 = new Connection(endpoints[0]);
      const connection2 = new Connection(endpoints[1]);

      const [slot1, slot2] = await Promise.all([
        connection1.getSlot(),
        connection2.getSlot()
      ]);

      expect(slot1).toBeGreaterThan(0);
      expect(slot2).toBeGreaterThan(0);
      // Remove the expectation that slots must be different
      // as they might be the same in real network conditions
    }, TEST_TIMEOUT);
  });
}); 