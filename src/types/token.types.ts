import { Document, Model, Query, FilterQuery, UpdateQuery } from 'mongoose';

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

export interface TokenDocument extends Document {
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

    // Virtual Properties
    isNearGraduation: boolean;

    // Methods
    updateTimeSeriesData(type: 'volume' | 'price' | 'holders', value: number): Promise<TokenDocument>;
    addPattern(pattern: Pattern): Promise<TokenDocument>;
    graduate(): Promise<TokenDocument>;
}

export interface TokenModel extends Model<TokenDocument> {
    findNearGraduation(): Query<TokenDocument[], TokenDocument>;
    findTopPotential(limit?: number): Query<TokenDocument[], TokenDocument>;
    find(filter?: FilterQuery<TokenDocument>): Query<TokenDocument[], TokenDocument>;
    findOne(filter: FilterQuery<TokenDocument>): Query<TokenDocument | null, TokenDocument>;
    findOneAndUpdate(
        filter: FilterQuery<TokenDocument>,
        update: UpdateQuery<TokenDocument>,
        options?: { new?: boolean }
    ): Query<TokenDocument | null, TokenDocument>;
} 