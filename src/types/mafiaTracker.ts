export interface WinnerCriteria {
  entryMcap: number;      // When mafia bought (e.g., $50k)
  exitMcap: number;       // Peak mcap (e.g., $5M)
  multiplier: number;     // 100x in this example
  timeToMoon: number;     // Hours from entry to peak
  tokenAddress: string;
  tokenSymbol?: string;
  entryTime: Date;
  peakTime: Date;
}

export interface AlertSpeed {
  detectionTime: number;      // When we detected the buy (timestamp)
  alertTime: number;          // When we sent alert (timestamp)
  latency: number;            // Must be <30 seconds
  tokenAgeAtAlert: number;    // In seconds, ideally <600 (10 minutes)
}

export interface MafiaWalletScore {
  wallet: string;
  totalWins: number;
  totalTrades: number;
  winRate: number;           // wins/trades
  avgMultiplier: number;     // Average return on wins
  lastActiveTime: number;
  trustScore: number;        // 0-100 based on history
  totalProfit: number;       // In USD
  avgTimeToPeak: number;     // Average hours to peak
}

export interface TradingSignals {
  entrySignal: {
    mafiaWalletsBuying: Array<{
      address: string;
      trustScore: number;
      amount: number;
    }>;
    averageBuySize: number;
    tokenAge: number; // in seconds
    confidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
    entryMcap: number;
    targetMcap: number; // Based on historical performance
  };
  
  exitSignal?: {
    mafiaWalletsSelling: string[];
    percentageSold: number;
    warning: 'EARLY' | 'NORMAL' | 'URGENT';
    currentMcap: number;
    profitMultiplier: number;
  };
}

export interface MafiaAlert {
  type: 'MAFIA_BUY' | 'COORDINATED_BUY' | 'INFLUENCER_ACTIVITY' | 'SERIAL_DEPLOYER' | 'EXIT_SIGNAL';
  wallet: string;
  token: string;
  tokenSymbol?: string;
  timestamp: Date;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  details: {
    tokenAge: number; // in seconds
    entryMcap: number;
    targetMcap: number;
    potentialReturn: number; // 10x, 50x, etc.
    speed: AlertSpeed;
    walletScores: MafiaWalletScore[];
  };
}
