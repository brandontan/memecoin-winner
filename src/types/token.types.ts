import mongoose, { Document, Model, Query, FilterQuery, UpdateQuery } from 'mongoose';

export interface TimeSeriesPoint {
    timestamp: Date;
    value: number;
}

export interface Pattern {
    type: string;
    description?: string;
    confidence: number;
    detectedAt: Date;
}

import { Types } from 'mongoose';

// Base document interface without mongoose properties
export interface ITokenBase {
  // Basic Token Information
  mintAddress: string;
  name: string;
  symbol: string;
  createdAt: Date;
  creator: string;

  // Trading Metrics
  currentVolume: number;
  currentPrice: number;
  holderCount: number;
  liquidityAmount: number;

  // Time-Series Data
  volumeHistory: TimeSeriesPoint[];
  priceHistory: TimeSeriesPoint[];
  holderHistory: TimeSeriesPoint[];

  // Analysis Results
  potentialScore: number;
  volumeGrowthRate: number;
  timeToGraduationEstimate?: Date;
  detectedPatterns: Pattern[];

  // Status Information
  lastUpdated: Date;
  isGraduated: boolean;
  graduatedAt?: Date;
  isActive: boolean;
}

// Document interface with Mongoose properties
export interface ITokenDocument extends ITokenBase, mongoose.Document {
  // Virtual Properties
  isNearGraduation: boolean;
  
  // Methods
  updateTimeSeriesData(type: 'volume' | 'price' | 'holders', value: number): Promise<this>;
  addPattern(pattern: Pattern): Promise<this>;
  graduate(): Promise<this>;
}

// For backward compatibility
export type TokenDocument = ITokenDocument;

// @ts-ignore - Using simpler type for now to unblock development
export interface TokenModel extends Model<ITokenDocument> {
    findNearGraduation(limit?: number): Promise<TokenDocument[]>;
    findTopPotential(limit?: number): Promise<TokenDocument[]>;
    findHighPotential(limit?: number, minScore?: number): Promise<TokenDocument[]>;
    findTrending(limit?: number): Promise<TokenDocument[]>;
    findByCreator(creatorAddress: string): Promise<TokenDocument[]>;
    search(query: string, limit?: number): Promise<TokenDocument[]>;
    
    // Standard Mongoose methods with proper return types
    find(filter?: FilterQuery<TokenDocument>): Query<TokenDocument[], TokenDocument, {}, TokenDocument>;
    findOne(filter: FilterQuery<TokenDocument>): Query<TokenDocument | null, TokenDocument, {}, TokenDocument>;
    findOneAndUpdate(
        filter: FilterQuery<TokenDocument>,
        update: UpdateQuery<TokenDocument>,
        options?: { new?: boolean; }
    ): Query<TokenDocument | null, TokenDocument, {}, TokenDocument>;
} 