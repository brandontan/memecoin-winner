import { Connection, PublicKey } from '@solana/web3.js';
import { Token, Transaction } from '../models';
import logger from '../utils/logger';
import { TransactionAnalyzer, toUnixTimestamp } from '../utils/transactionAnalyzer';

type TimeRange = {
  start: Date;
  end: Date;
};

type TokenAnalysis = {
  holdersAt1h: number;
  holderGrowthRate: number[];
  totalTransactions: number;
  uniqueBuyers: number;
  avgBuySize: number;
  transactionAcceleration: number;
  volumeFirstHour: number;
  sniperBotPercentage: number;
  organicWalletRatio: number;
  firstSocialMention?: Date;
};

type WinnerToken = {
  name: string;
  address: string;
  daysAgo: number;
  finalMcap: number;
};

export class WinningPatternsAnalyzer {
  private connection: Connection;
  private winners: WinnerToken[];
  private transactionAnalyzer: TransactionAnalyzer;

  constructor(connection: Connection) {
    this.connection = connection;
    this.transactionAnalyzer = new TransactionAnalyzer(connection);
    
    // Our recent winners data
    this.winners = [
      {
        name: 'SWARM',
        address: '3d7AzmWfTWJMwAxpoxgZ4uSMmGVaaC6z2f73dP3Mpump',
        daysAgo: 1,
        finalMcap: 5000000
      },
      {
        name: 'PHDKitty',
        address: 'BDmd5acf2CyydhnH6vjrCrCEY1ixHzRRK9HToPiKPdcS',
        daysAgo: 3,
        finalMcap: 8000000
      },
      {
        name: 'CHARLES',
        address: 'EwBUeMFm8Zcn79iJkDns3NdcL8t8B6Xikh9dKgZtpump',
        daysAgo: 4,
        finalMcap: 11417049
      },
      {
        name: 'APEX',
        address: '6rE8kJHDuskmwj1MmehvwL2i4QXdLmPTYnrxJm6Cpump',
        daysAgo: 4,
        finalMcap: 5015620
      },
      {
        name: 'USDUC',
        address: 'CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump',
        daysAgo: 7,
        finalMcap: 4387965
      }
    ];
  }

  public async analyzeWinners(): Promise<void> {
    logger.info('Analyzing winning token patterns...');
    
    for (const winner of this.winners) {
      logger.info(`\nAnalyzing ${winner.name} (${winner.address})...`);
      
      try {
        // Get token data
        const token = await Token.findOne({ address: winner.address });
        if (!token) {
          logger.warn(`No token data found for ${winner.name}`);
          continue;
        }
        
        // Analyze token patterns
        await this.analyzeTokenPatterns(token, winner);
        
        // Look for mafia activity in early transactions
        const launchTime = token.launchTime ? toUnixTimestamp(new Date(token.launchTime)) : Math.floor(Date.now() / 1000) - 7 * 24 * 3600; // Default to 7 days ago if no launch time
        const mafiaActivity = await this.transactionAnalyzer.findMafiaActivity(winner.address, launchTime);
        
        if (mafiaActivity.length > 0) {
          logger.warn(`🚨 Detected ${mafiaActivity.length} potential mafia wallets in ${winner.name}:`);
          mafiaActivity.forEach((activity, index) => {
            logger.warn(`${index + 1}. ${activity.buyer} - ${activity.profitMultiplier?.toFixed(2)}x profit`);
          });
        } else {
          logger.info('No obvious mafia activity detected in early transactions.');
        }
      } catch (error) {
        logger.error(`Error analyzing ${winner.name}:`, error);
      }
    }
  }
  
  private async analyzeTokenPatterns(token: any, winner: WinnerToken) {
    // Existing analysis logic here
    logger.info(`Analyzing token patterns for ${token.name}...`);
    
    // Add launch time tracking if not present
    if (!token.launchTime) {
      logger.info('No launch time recorded, using first transaction time as proxy...');
      // TODO: Fetch and set the first transaction time as launch time
    }
    
    const launchTime = new Date();
    launchTime.setDate(launchTime.getDate() - winner.daysAgo);
    
    const firstHourData = await this.analyzeFirstHour(token.address, launchTime);
    
    // Log key metrics
    this.logTokenAnalysis(token.name, firstHourData);
  }
  
  private logTokenAnalysis(tokenName: string, data: TokenAnalysis): void {
    logger.info(`\n=== ${tokenName} First Hour Analysis ===`);
    logger.info(`Holders at 1h: ${data.holdersAt1h}`);
    logger.info(`Total transactions: ${data.totalTransactions}`);
    logger.info(`Unique buyers: ${data.uniqueBuyers}`);
    logger.info(`Avg buy size: ${data.avgBuySize.toFixed(2)} SOL`);
    logger.info(`Volume first hour: ${data.volumeFirstHour.toFixed(2)} SOL`);
    logger.info(`Transaction acceleration: ${data.transactionAcceleration.toFixed(2)}x`);
    logger.info(`Organic wallet ratio: ${(data.organicWalletRatio * 100).toFixed(1)}%`);
    logger.info(`Sniper bot percentage: ${(data.sniperBotPercentage * 100).toFixed(1)}%`);
    if (data.firstSocialMention) {
      logger.info(`First social mention: ${data.firstSocialMention.toISOString()}`);
    }
  }
  
  private findCommonPatterns(results: Array<TokenAnalysis & { token: string }>): void {
    logger.info('\n=== COMMON PATTERNS FOUND ===');
    
    const minHolders = Math.min(...results.map(r => r.holdersAt1h));
    const minTxs = Math.min(...results.map(r => r.totalTransactions));
    const minOrganic = Math.min(...results.map(r => r.organicWalletRatio));
    const maxBot = Math.max(...results.map(r => r.sniperBotPercentage));
    
    logger.info('\nMINIMUM THRESHOLDS FOR SUCCESS:');
    logger.info(`- All winners had at least ${minHolders} holders in first hour`);
    logger.info(`- All winners had at least ${minTxs} transactions in first hour`);
    logger.info(`- All had at least ${(minOrganic * 100).toFixed(1)}% organic wallet activity`);
    logger.info(`- None had more than ${(maxBot * 100).toFixed(1)}% bot activity`);
    
    // Additional pattern analysis
    const avgTxAcceleration = results.reduce((sum, r) => sum + r.transactionAcceleration, 0) / results.length;
    logger.info(`\nAVERAGE TRANSACTION ACCELERATION: ${avgTxAcceleration.toFixed(1)}x`);
    
    const avgHoldersPerTx = results.reduce((sum, r) => sum + (r.holdersAt1h / r.totalTransactions), 0) / results.length;
    logger.info(`AVERAGE HOLDERS PER TRANSACTION: ${avgHoldersPerTx.toFixed(2)}`);
  }
  
  private async analyzeFirstHour(tokenAddress: string, launchTime: Date): Promise<TokenAnalysis> {
    const endTime = new Date(launchTime.getTime() + 60 * 60 * 1000); // +1 hour
    
    // Get all transactions in first hour
    const transactions = await Transaction.find({
      tokenAddress,
      timestamp: { $gte: launchTime, $lte: endTime }
    });
    
    // Get holders at 1h mark
    const holdersAt1h = await this.countUniqueHolders(tokenAddress, endTime);
    
    // Calculate holder growth rate (snapshots every 5 minutes)
    const holderGrowthRate = [];
    for (let i = 5; i <= 60; i += 5) {
      const time = new Date(launchTime.getTime() + i * 60 * 1000);
      const count = await this.countUniqueHolders(tokenAddress, time);
      holderGrowthRate.push(count);
    }
    
    // Define transaction interface for type safety
    interface TransactionData {
      timestamp: Date;
      from: string;
      amount: number;
      // Add other transaction properties as needed
    }

    // Cast transactions to TransactionData[] to ensure type safety
    const typedTransactions = transactions as TransactionData[];
    
    // Calculate transaction acceleration
    const firstHalf = typedTransactions.filter((t: TransactionData) => 
      t.timestamp < new Date(launchTime.getTime() + 30 * 60 * 1000)
    ).length;
    const secondHalf = typedTransactions.length - firstHalf;
    const transactionAcceleration = firstHalf > 0 ? secondHalf / firstHalf : 0;
    
    // Calculate other metrics
    const uniqueBuyers = new Set(typedTransactions.map((t: TransactionData) => t.from)).size;
    const totalVolume = typedTransactions.reduce((sum: number, t: TransactionData) => sum + t.amount, 0);
    const avgBuySize = typedTransactions.length > 0 ? totalVolume / typedTransactions.length : 0;
    
    // Analyze wallet quality (simplified)
    const { organicRatio, botPercentage } = await this.analyzeWalletQuality(transactions);
    
    // Check for social mentions (placeholder implementation)
    const firstSocialMention = await this.getFirstSocialMention(tokenAddress, launchTime, endTime);
    
    return {
      holdersAt1h,
      holderGrowthRate,
      totalTransactions: transactions.length,
      uniqueBuyers,
      avgBuySize,
      transactionAcceleration,
      volumeFirstHour: totalVolume,
      sniperBotPercentage: botPercentage,
      organicWalletRatio: organicRatio,
      firstSocialMention
    };
  }
  
  private async countUniqueHolders(tokenAddress: string, beforeDate: Date): Promise<number> {
    // This would query your database for unique holders before the given date
    const holders = await Transaction.distinct('to', {
      tokenAddress,
      timestamp: { $lte: beforeDate }
    });
    return holders.length;
  }
  
  private async analyzeWalletQuality(transactions: any[]): Promise<{ organicRatio: number; botPercentage: number }> {
    // This is a simplified implementation
    // In production, you'd analyze wallet patterns, transaction timing, etc.
    
    // Group transactions by buyer
    const buyerStats = new Map<string, { count: number; total: number }>();
    
    for (const tx of transactions) {
      if (!buyerStats.has(tx.from)) {
        buyerStats.set(tx.from, { count: 0, total: 0 });
      }
      const stats = buyerStats.get(tx.from)!;
      stats.count++;
      stats.total += tx.amount;
    }
    
    // Simple heuristics to detect bots
    let botLikeWallets = 0;
    const avgTxPerWallet = transactions.length / buyerStats.size;
    
    for (const [_, stats] of buyerStats) {
      // If a wallet made many transactions with the same amount, it might be a bot
      if (stats.count > avgTxPerWallet * 2) {
        botLikeWallets++;
      }
    }
    
    const botPercentage = buyerStats.size > 0 ? botLikeWallets / buyerStats.size : 0;
    const organicRatio = 1 - botPercentage; // Simplified
    
    return { organicRatio, botPercentage };
  }
  
  private async getFirstSocialMention(
    tokenAddress: string, 
    startTime: Date, 
    endTime: Date
  ): Promise<Date | undefined> {
    // In a real implementation, this would query your social media monitoring service
    // For now, we'll return a random time in the first 30 minutes for demonstration
    if (Math.random() > 0.8) { // 20% chance of no mention
      return undefined;
    }
    const mentionTime = new Date(
      startTime.getTime() + 
      Math.random() * (Math.min(endTime.getTime() - startTime.getTime(), 30 * 60 * 1000))
    );
    return mentionTime;
  }
}
