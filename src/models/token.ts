// @ts-nocheck
import mongoose, { Document, Model, Types } from 'mongoose';
import Transaction, { ITransaction } from './transaction';

const tokenSchema = new mongoose.Schema({
  // Core Identifiers
  mintAddress: { 
    type: String, 
    required: [true, 'Mint address is required'],
    unique: true, 
    index: true 
  },
  launchTime: {
    type: Date,
    index: true,
    default: Date.now
  },
  name: { 
    type: String, 
    required: [true, 'Token name is required'] 
  },
  symbol: { 
    type: String, 
    required: [true, 'Token symbol is required'] 
  },
  creator: { 
    type: String, 
    required: [true, 'Creator address is required'] 
  },
  
  // Trading Metrics
  currentPrice: { type: Number, default: 0 },
  currentVolume: { type: Number, default: 0 },
  holderCount: { type: Number, default: 0 },
  liquidityAmount: { type: Number, default: 0 },
  totalSupply: { type: Number, default: 0 },  // Total token supply
  circulatingSupply: { type: Number, default: 0 },  // Circulating supply
  marketCap: { type: Number, default: 0 },  // Market cap from Pump.fun
  marketCapTier: { 
    type: String, 
    enum: ['TINY', 'MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'MEGA'], 
    default: 'TINY' 
  },  // Market cap tier
  lastMarketCapUpdate: { type: Date },  // When market cap was last updated
  
  // Fundamentals Scoring
  fundamentalsScore: {
    liquidity: { type: Number, min: 0, max: 40, default: 0 },
    community: { type: Number, min: 0, max: 30, default: 0 },
    volume: { type: Number, min: 0, max: 30, default: 0 },
    total: { type: Number, min: 0, max: 100, default: 0 },
    grade: { type: String, enum: ['A', 'B', 'C', 'D', 'F'], default: 'F' },
    confidence: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
    lastUpdated: { type: Date, default: Date.now }
  },
  holderDistribution: [{
    address: { type: String, required: true },
    balance: { type: Number, required: true },
    percentage: { type: Number, default: 0 }
  }],
  concentrationRisk: {
    level: { type: String, enum: ['low', 'moderate', 'elevated', 'high', 'manipulated', 'unknown'], default: 'unknown' },
    score: { type: Number, default: 0 },
    top10pct: { type: Number, default: 0 },
    updatedAt: { type: Date }
  },
  
  // Time-Series Data
  volumeHistory: [{
    timestamp: Date,
    volume: Number
  }],
  
  priceHistory: [{
    timestamp: Date,
    price: Number
  }],
  
  holderHistory: [{
    timestamp: Date,
    count: Number
  }],
  
  // Analysis Results
  potentialScore: { type: Number, default: 0 },
  volumeGrowthRate: { type: Number, default: 0 },
  timeToGraduationEstimate: Date,
  detectedPatterns: [{
    type: String,
    description: String,
    confidence: Number,
    detectedAt: Date
  }],
  
  // Status Information
  lastUpdated: { type: Date, default: Date.now },
  isGraduated: { type: Boolean, default: false },
  graduatedAt: Date,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Virtual for isNearGraduation
tokenSchema.virtual('isNearGraduation').get(function() {
  return this.potentialScore >= 80 && !this.isGraduated;
});

// Transaction-related methods
tokenSchema.methods.getTransactionsSince = async function(hours: number): Promise<ITransaction[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return Transaction.find({
    tokenAddress: this.mintAddress,
    timestamp: { $gte: since }
  }).sort({ timestamp: -1 });
};

tokenSchema.methods.calculateRealTimeHolders = async function(): Promise<number> {
  const result = await Transaction.aggregate([
    {
      $match: {
        tokenAddress: this.mintAddress.toLowerCase()
      }
    },
    {
      $group: {
        _id: '$to',
        balance: {
          $sum: {
            $cond: [
              { $eq: ['$to', '$_id'] },
              '$amount',
              { $subtract: [
                { $cond: [{ $eq: ['$from', '$_id'] }, '$amount', 0] },
                { $cond: [{ $eq: ['$to', '$_id'] }, '$amount', 0] }
              ]}
            ]
          }
        }
      }
    },
    {
      $match: {
        balance: { $gt: 0 }
      }
    },
    {
      $count: 'holderCount'
    }
  ]);

  return result[0]?.holderCount || 0;
};

tokenSchema.methods.calculateBuyPressure24h = async function(): Promise<{
  buyVolume: number;
  sellVolume: number;
  buyPressure: number; // Ratio of buy volume to total volume (0-1)
  buyCount: number;
  sellCount: number;
}> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const result = await Transaction.aggregate([
    {
      $match: {
        tokenAddress: this.mintAddress.toLowerCase(),
        timestamp: { $gte: oneDayAgo },
        type: { $in: ['BUY', 'SELL'] }
      }
    },
    {
      $group: {
        _id: '$type',
        totalVolume: { $sum: '$usdValue' },
        count: { $sum: 1 }
      }
    }
  ]);

  const buyData = result.find(r => r._id === 'BUY') || { totalVolume: 0, count: 0 };
  const sellData = result.find(r => r._id === 'SELL') || { totalVolume: 0, count: 0 };
  
  const totalVolume = buyData.totalVolume + sellData.totalVolume;
  
  return {
    buyVolume: buyData.totalVolume,
    sellVolume: sellData.totalVolume,
    buyPressure: totalVolume > 0 ? buyData.totalVolume / totalVolume : 0,
    buyCount: buyData.count,
    sellCount: sellData.count
  };
};

// Add methods
tokenSchema.methods.updateTimeSeriesData = async function(type, value) {
  const timestamp = new Date();
  const historyField = `${type}History`;
  
  if (!this[historyField]) {
    this[historyField] = [];
  }
  
  // Use appropriate field name based on history type
  const dataPoint: any = { timestamp };
  if (type === 'volume') {
    dataPoint.volume = value;
    this.currentVolume = value;
  } else if (type === 'price') {
    dataPoint.price = value;
    this.currentPrice = value;
  } else if (type === 'holders') {
    dataPoint.count = value;
    this.holderCount = value;
  }
  
  this[historyField].push(dataPoint);
  
  this.lastUpdated = timestamp;
  return this.save();
};

tokenSchema.methods.addPattern = async function(pattern) {
  if (!this.detectedPatterns) this.detectedPatterns = [];
  
  if (typeof pattern === 'string') {
    // Handle string pattern (for backward compatibility)
    if (!this.detectedPatterns.includes(pattern)) {
      this.detectedPatterns.push(pattern);
    }
  } else {
    // Handle object pattern
    this.detectedPatterns.push({
      type: pattern.type,
      confidence: pattern.confidence || 0.5, // Default confidence
      detectedAt: pattern.timestamp || new Date()
    });
  }
  
  return this.save();
};

tokenSchema.methods.graduate = async function() {
  this.isGraduated = true;
  this.graduatedAt = new Date();
  return this.save();
};

// Static methods
tokenSchema.statics.findNearGraduation = async function(limit = 10) {
  return this.find({
    potentialScore: { $gte: 80 },
    isGraduated: false,
    isActive: true
  })
  .sort({ potentialScore: -1 })
  .limit(limit)
  .exec();
};

tokenSchema.statics.findTopPotential = async function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ potentialScore: -1 })
    .limit(limit)
    .exec();
};

// Add remaining static methods
tokenSchema.statics.findHighPotential = async function(limit = 10, minScore = 70) {
  return this.find({
    potentialScore: { $gte: minScore },
    isActive: true
  })
  .sort({ potentialScore: -1 })
  .limit(limit)
  .exec();
};

tokenSchema.statics.findTrending = async function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ 'volumeHistory.0.value': -1 })
    .limit(limit)
    .exec();
};

tokenSchema.statics.findByCreator = async function(creatorAddress) {
  return this.find({ creator: creatorAddress, isActive: true }).exec();
};

// Add search method
tokenSchema.statics.search = async function(query: string, limit: number = 10) {
  return this.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { symbol: { $regex: query, $options: 'i' } },
      { mintAddress: { $regex: query, $options: 'i' } }
    ]
  })
  .limit(limit)
  .exec();
};

// Define the Token document interface
interface IHolderDistribution {
  address: string;
  balance: number;
  percentage?: number;
}

interface IConcentrationRisk {
  level: 'low' | 'moderate' | 'elevated' | 'high' | 'manipulated' | 'unknown';
  score: number;
  top10pct: number;
  updatedAt?: Date;
}

interface IFundamentalsScore {
  liquidity: number;
  community: number;
  volume: number;
  total: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  confidence: 'Low' | 'Medium' | 'High';
  lastUpdated: Date;
}

interface ITokenDocument extends Document {
  mintAddress: string;
  name: string;
  symbol: string;
  creator: string;
  launchTime?: Date;
  currentPrice: number;
  currentVolume: number;
  holderCount: number;
  liquidityAmount: number;
  holderDistribution: IHolderDistribution[];
  concentrationRisk: IConcentrationRisk;
  volumeHistory: Array<{ timestamp: Date; volume: number }>;
  priceHistory: Array<{ timestamp: Date; price: number }>;
  holderHistory: Array<{ timestamp: Date; count: number }>;
  potentialScore: number;
  volumeGrowthRate: number;
  timeToGraduationEstimate?: Date;
  // Updated to allow string patterns for compatibility
  detectedPatterns: Array<string | {
    type: string;
    description?: string;
    confidence: number;
    detectedAt: Date;
  }>;
  lastUpdated: Date;
  isGraduated: boolean;
  graduatedAt?: Date;
  isActive: boolean;
  isNearGraduation: boolean;
  updatedAt: Date;
  
  // Add metrics object
  metrics?: {
    currentVolume?: number;
    volumeGrowthRate?: number;
    fundamentalsScore: IFundamentalsScore;
    [key: string]: any;
  };
  
  updateTimeSeriesData(type: 'volume' | 'price' | 'holders', value: number): Promise<ITokenDocument>;
  addPattern(pattern: string | { type: string; confidence: number; timestamp?: Date }): Promise<ITokenDocument>;
  graduate(): Promise<ITokenDocument>;
  save(): Promise<ITokenDocument>;
}

// Define the Token model interface
interface ITokenModel extends Model<ITokenDocument> {
  findNearGraduation(limit?: number): Promise<ITokenDocument[]>;
  findTopPotential(limit?: number): Promise<ITokenDocument[]>;
  findHighPotential(limit?: number, minScore?: number): Promise<ITokenDocument[]>;
  findTrending(limit?: number): Promise<ITokenDocument[]>;
  findByCreator(creatorAddress: string): Promise<ITokenDocument[]>;
  search(query: string, limit?: number): Promise<ITokenDocument[]>;
}

// Add static methods
// @ts-ignore
const Token = (mongoose.models.Token as ITokenModel) || 
  mongoose.model<ITokenDocument, ITokenModel>('Token', tokenSchema);

// Add static method for calculating initial score
Token.calculateInitialScore = function(tokenData: any): number {
  let score = 0;
  
  // Liquidity Points (0-40)
  const liquidity = tokenData.initialLiquidity || 0;
  if (liquidity < 1000) score += 0;
  else if (liquidity < 5000) score += 10;
  else if (liquidity < 20000) score += 20;
  else if (liquidity < 50000) score += 30;
  else score += 40;
  
  // Creator Points (0-20) - basic for MVP
  score += 10;
  
  // Timing Points (0-20)
  const hour = new Date().getHours();
  if (hour >= 12 && hour <= 20) score += 20;
  else if (hour >= 8 && hour <= 12) score += 15;
  else if (hour >= 20 || hour <= 3) score += 10;
  else score += 0;
  
  // Safety Points (0-20)
  score += 20;
  
  return Math.min(score, 100);
};

// Create the model with proper typing
Object.assign(Token, {
  findNearGraduation: tokenSchema.statics.findNearGraduation,
  findTopPotential: tokenSchema.statics.findTopPotential,
  findHighPotential: tokenSchema.statics.findHighPotential,
  findTrending: tokenSchema.statics.findTrending,
  findByCreator: tokenSchema.statics.findByCreator,
  search: tokenSchema.statics.search,
  calculateInitialScore: Token.calculateInitialScore
});

export default Token;

export { ITokenDocument };
export default Token;