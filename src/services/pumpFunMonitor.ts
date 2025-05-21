import { Connection, PublicKey, ParsedTransactionWithMeta, ParsedInstruction, PartiallyDecodedInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config/config';
import logger from '../utils/logger';
import Token from '../models/token';

// Constants
export const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const GRADUATION_THRESHOLD = 69000; // 69K SOL

interface TokenCreationEvent {
  mintAddress: string;
  creator: string;
  name?: string;
  symbol?: string;
  createdAt: Date;
}

interface ProcessedSignature {
  signature: string;
  processedAt: Date;
}

class PumpFunMonitor {
  private connection: Connection;
  private processedSignatures: Set<string>;
  private isRunning: boolean;
  private lastProcessedSlot: number;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private trackingInterval: NodeJS.Timeout | null = null;
  private pollingInterval: number = 1000; // Default polling interval

  constructor() {
    this.connection = new Connection(config.solana.rpcEndpoint);
    this.processedSignatures = new Set();
    this.isRunning = false;
    this.lastProcessedSlot = 0;
  }

  async startOnce(): Promise<void> {
    try {
      // Run a single detection cycle
      await this.detectNewTokens();
      await this.updateTrackedTokens();
      return Promise.resolve();
    } catch (error) {
      logger.error('Error in startOnce:', error);
      return Promise.reject(error);
    }
  }

  start(options: { continuous?: boolean } = { continuous: true }): void {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('Starting Pump.fun monitoring');

    // Run once immediately
    this.startOnce().catch(error => logger.error('Error in initial detection:', error));

    // Set up continuous monitoring only if not in testing mode
    if (options.continuous) {
      this.monitoringInterval = setInterval(
        () => this.detectNewTokens().catch(error => logger.error('Error in token detection:', error)),
        this.pollingInterval
      );

      this.trackingInterval = setInterval(
        () => this.updateTrackedTokens().catch(error => logger.error('Error in token tracking:', error)),
        this.pollingInterval
      );
    }
  }

  stop(): void {
    if (!this.isRunning) return;

    if (this.monitoringInterval) clearInterval(this.monitoringInterval);
    if (this.trackingInterval) clearInterval(this.trackingInterval);

    this.isRunning = false;
    logger.info('Stopped Pump.fun monitoring');
  }

  private async monitorTransactions(): Promise<void> {
    let currentInterval = 1000; // Start with 1 second
    const maxInterval = 300000; // Max 5 minutes
    const backoffFactor = 2;

    while (this.isRunning) {
      try {
        const currentSlot = await this.connection.getSlot();
        
        if (currentSlot > this.lastProcessedSlot) {
          const signatures = await this.connection.getSignaturesForAddress(
            PUMP_FUN_PROGRAM_ID,
            { until: this.lastProcessedSlot.toString() }
          );

          for (const sigInfo of signatures) {
            if (this.processedSignatures.has(sigInfo.signature)) {
              continue;
            }

            await this.processTransaction(sigInfo.signature);
            this.processedSignatures.add(sigInfo.signature);
          }

          this.lastProcessedSlot = currentSlot;
          currentInterval = 1000; // Reset interval on success
        }

        // Wait before next iteration
        await new Promise(resolve => setTimeout(resolve, currentInterval));
      } catch (error) {
        logger.error('Error in transaction monitoring:', error);
        
        // Implement exponential backoff
        currentInterval = Math.min(currentInterval * backoffFactor, maxInterval);
        logger.warn(`Rate limit hit. Backing off to ${currentInterval}ms`);
        
        // Wait with backoff
        await new Promise(resolve => setTimeout(resolve, currentInterval));
      }
    }
  }

  private async processTransaction(signature: string): Promise<void> {
    try {
      const tx = await this.connection.getParsedTransaction(signature);
      if (!tx || !tx.meta || tx.meta.err) {
        return;
      }

      // Look for token creation instruction
      const tokenCreationInstruction = tx.transaction.message.instructions.find(
        (ix) => {
          if ('parsed' in ix && ix.program === 'spl-token') {
            return ix.parsed.type === 'initializeMint';
          }
          return false;
        }
      );

      if (tokenCreationInstruction && 'parsed' in tokenCreationInstruction) {
        const mintAddress = tokenCreationInstruction.parsed.info.mint;
        const creator = tx.transaction.message.accountKeys[0].pubkey.toString();

        // Check if token already exists
        const existingToken = await Token.findOne({ mintAddress });
        if (existingToken) {
          return;
        }

        // Create new token in database
        await Token.create({
          mintAddress,
          creator,
          createdAt: new Date(),
          currentVolume: 0,
          currentPrice: 0,
          holderCount: 0,
          liquidityAmount: 0,
          volumeHistory: [{ timestamp: new Date(), value: 0 }],
          priceHistory: [{ timestamp: new Date(), value: 0 }],
          holderHistory: [{ timestamp: new Date(), value: 0 }],
          potentialScore: 0,
          volumeGrowthRate: 0,
          isGraduated: false,
          isActive: true,
          lastUpdated: new Date(),
          detectedPatterns: []
        });

        logger.info(`New token detected: ${mintAddress}`);
      }
    } catch (error) {
      logger.error(`Error processing transaction ${signature}:`, error);
    }
  }

  private detectTokenCreation(tx: ParsedTransactionWithMeta): TokenCreationEvent | null {
    try {
      const { meta, transaction } = tx;
      if (!meta || !transaction) {
        return null;
      }

      // Check if transaction involves Pump.fun program
      const pumpFunInstruction = transaction.message.instructions.find(
        (ix: ParsedInstruction | PartiallyDecodedInstruction) => 
          ix.programId.equals(PUMP_FUN_PROGRAM_ID)
      );

      if (!pumpFunInstruction || !this.isParsedInstruction(pumpFunInstruction)) {
        return null;
      }

      // Look for token creation indicators
      const isTokenCreation = this.isTokenCreationInstruction(pumpFunInstruction);
      if (!isTokenCreation) {
        return null;
      }

      // Extract token data from the Pump.fun instruction
      const parsed = pumpFunInstruction.parsed;
      if (!parsed || !parsed.info) {
        return null;
      }

      const mintAddress = parsed.info.mint;
      const creator = parsed.info.creator || transaction.message.accountKeys[0].pubkey.toString();
      const metadata = this.extractMetadata(tx);

      if (!mintAddress) {
        return null;
      }

      logger.info(`Detected token creation: ${mintAddress} by ${creator}`);

      return {
        mintAddress,
        creator,
        name: metadata?.name,
        symbol: metadata?.symbol,
        createdAt: new Date(tx.blockTime! * 1000)
      };
    } catch (error) {
      logger.error('Error detecting token creation:', error);
      return null;
    }
  }

  private isParsedInstruction(ix: ParsedInstruction | PartiallyDecodedInstruction): ix is ParsedInstruction {
    return 'program' in ix && 'parsed' in ix;
  }

  private isTokenCreationInstruction(ix: ParsedInstruction): boolean {
    const program = ix.program;
    const parsed = ix.parsed;

    // Check for SPL token initialization or mint instructions
    if (program === 'spl-token' && (parsed.type === 'initializeMint' || parsed.type === 'mintTo')) {
      return true;
    }

    // Check for Pump.fun token creation instruction
    if (program === 'pump-fun' && parsed.type === 'createToken') {
      return true;
    }

    return false;
  }

  private extractMintAddress(tx: any): string | null {
    try {
      // Look for token program instructions
      const tokenIx = tx.message.instructions.find(
        (ix: ParsedInstruction | PartiallyDecodedInstruction) => 
          ix.programId.equals(TOKEN_PROGRAM_ID)
      );

      if (tokenIx && this.isParsedInstruction(tokenIx)) {
        // Extract mint address from parsed instruction
        const parsed = tokenIx.parsed;
        if (parsed && parsed.info && parsed.info.mint) {
          return parsed.info.mint;
        }
      }

      // Look for Pump.fun program instructions
      const pumpFunIx = tx.message.instructions.find(
        (ix: ParsedInstruction | PartiallyDecodedInstruction) => 
          ix.programId.equals(PUMP_FUN_PROGRAM_ID)
      );

      if (pumpFunIx && this.isParsedInstruction(pumpFunIx)) {
        // Extract mint address from parsed instruction
        const parsed = pumpFunIx.parsed;
        if (parsed && parsed.info && parsed.info.mint) {
          return parsed.info.mint;
        }
      }

      return null;
    } catch (error) {
      logger.error('Error extracting mint address:', error);
      return null;
    }
  }

  private extractMetadata(tx: ParsedTransactionWithMeta): { name?: string; symbol?: string } | null {
    try {
      // Look for metadata program instructions
      const metadataIx = tx.transaction.message.instructions.find(
        (ix: ParsedInstruction | PartiallyDecodedInstruction) => 
          ix.programId.equals(METADATA_PROGRAM_ID)
      );

      if (!metadataIx || !this.isParsedInstruction(metadataIx)) {
        return null;
      }

      // Extract metadata from instruction data
      // This is a simplified version - you'll need to implement proper metadata parsing
      return {
        name: 'Unknown Token',
        symbol: 'UNKNOWN'
      };
    } catch (error) {
      logger.error('Error extracting metadata:', error);
      return null;
    }
  }

  private async handleTokenCreation(event: TokenCreationEvent): Promise<void> {
    try {
      // Check if token already exists
      const existingToken = await Token.findOne({ mintAddress: event.mintAddress });
      if (existingToken) {
        logger.info(`Token ${event.mintAddress} already exists`);
        return;
      }

      // Create new token
      const token = await Token.create({
        mintAddress: event.mintAddress,
        name: event.name || 'Unknown Token',
        symbol: event.symbol || 'UNKNOWN',
        createdAt: event.createdAt,
        creator: event.creator,
        currentVolume: 0,
        currentPrice: 0,
        holderCount: 0,
        liquidityAmount: 0,
        volumeHistory: [{ timestamp: event.createdAt, value: 0 }],
        priceHistory: [{ timestamp: event.createdAt, value: 0 }],
        holderHistory: [{ timestamp: event.createdAt, value: 0 }],
        potentialScore: 0,
        volumeGrowthRate: 0,
        isGraduated: false,
        isActive: true
      });

      logger.info(`New token created: ${token.mintAddress}`);
    } catch (error) {
      logger.error('Error handling token creation:', error);
    }
  }

  private async getTokenVolume(mintAddress: string): Promise<number> {
    try {
      // Get token supply to calculate volume
      const supply = await this.connection.getTokenSupply(new PublicKey(mintAddress));
      if (!supply.value.uiAmount) {
        return 0;
      }

      // Get recent transactions for the token
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(mintAddress),
        { limit: 100 }
      );

      let volume = 0;
      for (const sig of signatures) {
        const tx = await this.connection.getParsedTransaction(sig.signature);
        if (tx?.meta?.postTokenBalances) {
          const tokenBalance = tx.meta.postTokenBalances.find(
            balance => balance.mint === mintAddress
          );
          if (tokenBalance?.uiTokenAmount.uiAmount) {
            volume += tokenBalance.uiTokenAmount.uiAmount;
          }
        }
      }

      return volume;
    } catch (error) {
      logger.error(`Error getting token volume for ${mintAddress}:`, error);
      return 0;
    }
  }

  async updateTokenMetrics(mintAddress: string): Promise<void> {
    try {
      const token = await Token.findOne({ mintAddress });
      if (!token) {
        return;
      }

      // Get token volume
      const volume = await this.getTokenVolume(mintAddress);
      
      // Update token metrics
      token.currentVolume = volume;
      token.volumeHistory.push({
        timestamp: new Date(),
        value: volume
      });

      // Calculate volume growth rate
      if (token.volumeHistory.length > 1) {
        const prevVolume = token.volumeHistory[token.volumeHistory.length - 2].value;
        token.volumeGrowthRate = prevVolume > 0 ? (volume - prevVolume) / prevVolume : 0;
      }

      // Check for graduation
      if (volume >= config.launchpads.pumpFun.graduationThreshold && !token.isGraduated) {
        token.isGraduated = true;
        token.graduatedAt = new Date();
        logger.info(`Token ${mintAddress} has graduated!`);
      }

      token.lastUpdated = new Date();
      await token.save();
    } catch (error) {
      logger.error(`Error updating metrics for token ${mintAddress}:`, error);
    }
  }

  async detectNewTokens(): Promise<void> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        PUMP_FUN_PROGRAM_ID,
        { limit: 10 }
      );

      for (const sigInfo of signatures) {
        if (this.processedSignatures.has(sigInfo.signature)) {
          continue;
        }

        const tx = await this.connection.getParsedTransaction(sigInfo.signature);
        if (!tx || (tx.meta && tx.meta.err)) continue;

        // First try to detect token creation through Pump.fun program
        const tokenEvent = this.detectTokenCreation(tx);
        if (tokenEvent) {
          logger.info(`Detected token creation event: ${JSON.stringify(tokenEvent)}`);
          await this.handleTokenCreation(tokenEvent);
          this.processedSignatures.add(sigInfo.signature);
          continue;
        }

        // If no Pump.fun token creation, try SPL token creation
        await this.processTransaction(sigInfo.signature);
        this.processedSignatures.add(sigInfo.signature);
      }
    } catch (error) {
      logger.error('Error detecting new tokens:', error);
      throw error; // Propagate error for test handling
    }
  }

  async checkGraduation(mintAddress: string): Promise<void> {
    try {
      const token = await Token.findOne({ mintAddress });
      if (!token) return;

      const volume = await this.getTokenVolume(mintAddress);
      const threshold = config.launchpads.pumpFun.graduationThreshold;
      
      logger.info(`Checking graduation for ${mintAddress}: volume=${volume}, threshold=${threshold}`);
      
      if (volume >= threshold && !token.isGraduated) {
        token.isGraduated = true;
        token.graduatedAt = new Date();
        await token.save();
        logger.info(`Token ${mintAddress} has graduated!`);
      }
    } catch (error) {
      logger.error(`Error checking graduation for token ${mintAddress}:`, error);
    }
  }

  async detectPatterns(mintAddress: string): Promise<void> {
    try {
      const token = await Token.findOne({ mintAddress });
      if (!token) return;

      const patterns: string[] = [];

      // Check volume growth pattern
      if (token.volumeHistory.length >= 2) {
        const recentVolumes = token.volumeHistory.slice(-5);
        const oldestVolume = recentVolumes[0].value;
        const newestVolume = recentVolumes[recentVolumes.length - 1].value;

        if (oldestVolume > 0) {
          const growthRate = (newestVolume - oldestVolume) / oldestVolume;
          if (growthRate > 0.5) {
            patterns.push('volume_increase');
          }
        }
      }

      // Check holder growth pattern
      if (token.holderHistory.length >= 2) {
        const recentHolders = token.holderHistory.slice(-5);
        const oldestHolders = recentHolders[0].value;
        const newestHolders = recentHolders[recentHolders.length - 1].value;

        if (oldestHolders > 0) {
          const growthRate = (newestHolders - oldestHolders) / oldestHolders;
          if (growthRate > 0.2) {
            patterns.push('holder_growth');
          }
        }
      }

      if (patterns.length > 0) {
        token.detectedPatterns = patterns;
        await token.save();
        logger.info(`Detected patterns for ${mintAddress}: ${patterns.join(', ')}`);
      }
    } catch (error) {
      logger.error(`Error detecting patterns for token ${mintAddress}:`, error);
    }
  }

  async updateTrackedTokens(): Promise<void> {
    try {
      const tokens = await Token.find({ isActive: true });
      for (const token of tokens) {
        await this.updateTokenMetrics(token.mintAddress);
        await this.checkGraduation(token.mintAddress);
        await this.detectPatterns(token.mintAddress);
      }
    } catch (error) {
      logger.error('Error updating tracked tokens:', error);
    }
  }
}

export default PumpFunMonitor; 