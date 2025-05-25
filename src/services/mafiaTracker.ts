import { Connection, PublicKey } from '@solana/web3.js';
import { Transaction, Token, TokenModel } from '../models';
import { logger } from '../utils/logger';
import { subHours, differenceInSeconds } from 'date-fns';

type WalletActivity = {
  wallet: string;
  token: string;
  tokenSymbol?: string;
  amount: number;
  timestamp: Date;
  mcapAtBuy: number;
};

type MafiaWallet = {
  address: string;
  successfulTrades: number;
  tokensBought: string[];
  lastActive: Date;
  successRate: number;
  totalSpent: number;
  totalProfit: number;
};

type Alert = {
  type: 'MAFIA_BUY' | 'COORDINATED_BUY' | 'INFLUENCER_ACTIVITY' | 'SERIAL_DEPLOYER';
  wallet: string;
  token: string;
  tokenSymbol?: string;
  timestamp: Date;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  details: Record<string, any>;
};

export class MafiaTracker {
  private knownMafia: Map<string, MafiaWallet> = new Map();
  private connection: Connection;
  private alertSubscribers: ((alert: Alert) => void)[] = [];
  
  constructor(connection: Connection) {
    this.connection = connection;
    this.initializeKnownMafia();
  }

  public subscribeToAlerts(callback: (alert: Alert) => void): void {
    this.alertSubscribers.push(callback);
  }

  private async initializeKnownMafia(): Promise<void> {
    // Start with known successful wallets from our database
    const successfulWallets = await this.identifyRepeatWinners();
    
    for (const [address, data] of Object.entries(successfulWallets)) {
      this.knownMafia.set(address, {
        address,
        successfulTrades: data.tokens.length,
        tokensBought: data.tokens,
        lastActive: new Date(Math.max(...data.timestamps)),
        successRate: data.successRate,
        totalSpent: data.totalSpent,
        totalProfit: data.totalProfit
      });
    }
    
    logger.info(`Initialized MafiaTracker with ${this.knownMafia.size} known smart money wallets`);
  }

  public async identifyRepeatWinners(): Promise<Record<string, { tokens: string[], timestamps: number[], successRate: number, totalSpent: number, totalProfit: number }>> {
    // Get all successful tokens (e.g., MCap > $1M)
    const successfulTokens = await TokenModel.find({
      'metrics.marketCap': { $gt: 1000000 },
      createdAt: { $gt: subHours(new Date(), 24 * 7) } // Last 7 days
    }).sort({ 'metrics.marketCap': -1 }).limit(50);

    const walletPerformance: Record<string, { tokens: string[], timestamps: number[], amounts: number[] }> = {};
    
    // Analyze each successful token
    for (const token of successfulTokens) {
      // Get early buyers (first 100 transactions or first hour)
      const earlyBuys = await Transaction.find({
        tokenAddress: token.address,
        timestamp: { 
          $lte: new Date(token.createdAt.getTime() + 60 * 60 * 1000) // First hour
        }
      }).sort('timestamp').limit(100);
      
      // Track wallets that bought early
      for (const tx of earlyBuys) {
        const wallet = tx.from;
        if (!walletPerformance[wallet]) {
          walletPerformance[wallet] = { tokens: [], timestamps: [], amounts: [] };
        }
        
        walletPerformance[wallet].tokens.push(token.symbol || token.address);
        walletPerformance[wallet].timestamps.push(tx.timestamp.getTime());
        walletPerformance[wallet].amounts.push(tx.amount);
      }
    }
    
    // Calculate success rates and profits
    const result: Record<string, any> = {};
    
    for (const [wallet, data] of Object.entries(walletPerformance)) {
      // Only consider wallets that bought multiple winners
      if (data.tokens.length >= 3) {
        // In a real implementation, we'd calculate actual profits
        // For now, we'll use a simplified model
        const successRate = Math.min(data.tokens.length / 5, 1); // Assume 5 tokens = 100% success rate
        const totalSpent = data.amounts.reduce((a, b) => a + b, 0);
        const totalProfit = totalSpent * successRate * 3; // Assume 3x return on successful trades
        
        result[wallet] = {
          tokens: data.tokens,
          timestamps: data.timestamps,
          successRate,
          totalSpent,
          totalProfit
        };
      }
    }
    
    return result;
  }

  public async monitorMafiaActivity(): Promise<void> {
    logger.info('Starting mafia wallet monitoring...');
    
    // Check each known mafia wallet for recent activity
    for (const [address, wallet] of this.knownMafia.entries()) {
      try {
        await this.checkWalletActivity(address);
      } catch (error) {
        logger.error(`Error checking wallet ${address}:`, error);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Check for coordinated buys
    await this.detectCoordinatedBuys();
    
    logger.info('Completed mafia wallet monitoring cycle');
  }
  
  private async checkWalletActivity(walletAddress: string): Promise<void> {
    const recentBuys = await this.getRecentBuys(walletAddress, 1); // Last hour
    
    for (const buy of recentBuys) {
      // Check if this is a new token
      const tokenAge = differenceInSeconds(new Date(), buy.timestamp);
      
      if (tokenAge < 3600) { // Token is less than 1 hour old
        const wallet = this.knownMafia.get(walletAddress)!;
        
        // Create alert
        const alert: Alert = {
          type: 'MAFIA_BUY',
          wallet: walletAddress,
          token: buy.token,
          tokenSymbol: buy.tokenSymbol,
          timestamp: new Date(),
          confidence: wallet.successfulTrades > 5 ? 'HIGH' : 'MEDIUM',
          details: {
            tokenAgeMinutes: Math.round(tokenAge / 60),
            walletSuccessRate: wallet.successRate,
            previousWinners: wallet.tokensBought.slice(0, 3), // Show last 3 winners
            amountSpent: buy.amount
          }
        };
        
        // Notify subscribers
        this.notifyAlert(alert);
      }
    }
  }
  
  private async detectCoordinatedBuys(): Promise<void> {
    const COORDINATION_WINDOW = 10 * 60; // 10 minutes in seconds
    
    // Get all recent buys from mafia wallets
    const recentBuys: Array<{
      wallet: string;
      token: string;
      tokenSymbol?: string;
      timestamp: Date;
      amount: number;
    }> = [];
    
    for (const address of this.knownMafia.keys()) {
      const buys = await this.getRecentBuys(address, 24); // Last 24 hours
      recentBuys.push(...buys.map(buy => ({ ...buy, wallet: address })));
    }
    
    // Group by token
    const tokenGroups: Record<string, typeof recentBuys> = {};
    for (const buy of recentBuys) {
      if (!tokenGroups[buy.token]) {
        tokenGroups[buy.token] = [];
      }
      tokenGroups[buy.token].push(buy);
    }
    
    // Check for coordination
    for (const [token, buys] of Object.entries(tokenGroups)) {
      if (buys.length >= 3) { // At least 3 mafia wallets
        const timestamps = buys.map(b => b.timestamp.getTime());
        const timeDiff = (Math.max(...timestamps) - Math.min(...timestamps)) / 1000; // in seconds
        
        if (timeDiff <= COORDINATION_WINDOW) {
          // This is a coordinated buy
          const alert: Alert = {
            type: 'COORDINATED_BUY',
            wallet: 'MULTIPLE',
            token,
            tokenSymbol: buys[0].tokenSymbol,
            timestamp: new Date(),
            confidence: 'HIGH',
            details: {
              numberOfWallets: buys.length,
              timeWindowSeconds: timeDiff,
              wallets: buys.map(b => ({
                address: b.wallet,
                amount: b.amount,
                time: b.timestamp
              }))
            }
          };
          
          this.notifyAlert(alert);
        }
      }
    }
  }
  
  private async getRecentBuys(wallet: string, hours: number): Promise<Array<{
    token: string;
    tokenSymbol?: string;
    timestamp: Date;
    amount: number;
  }>> {
    // In a real implementation, this would query the blockchain or your database
    // For now, we'll return a mock implementation
    return [];
  }
  
  private notifyAlert(alert: Alert): void {
    // Log the alert
    logger.info(`ALERT: ${alert.type} - ${alert.token} by ${alert.wallet}`);
    
    // Notify all subscribers
    for (const callback of this.alertSubscribers) {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Error in alert callback:', error);
      }
    }
  }
}
