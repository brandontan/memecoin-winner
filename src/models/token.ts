import { Schema, model, models, Document, Model } from 'mongoose';
import logger from '../utils/logger';

export interface IToken extends Document {
    mintAddress: string;
    name: string;
    symbol: string;
    createdAt: Date;
    creator: string;
    currentVolume: number;
    currentPrice: number;
    holderCount: number;
    liquidityAmount: number;
    volumeHistory: { timestamp: Date; value: number }[];
    priceHistory: { timestamp: Date; value: number }[];
    holderHistory: { timestamp: Date; value: number }[];
    potentialScore: number;
    volumeGrowthRate: number;
    isGraduated: boolean;
    isActive: boolean;
    lastUpdated: Date;
    detectedPatterns: string[];
    graduatedAt?: Date;
    updateTimeSeriesData: (field: 'volume' | 'price' | 'holders', value: number) => Promise<void>;
    addPattern(pattern: any): Promise<IToken>;
    graduate(): Promise<IToken>;
}

interface ITokenModel extends Model<IToken> {
    findNearGraduation(): Promise<IToken[]>;
    findTopPotential(limit?: number): Promise<IToken[]>;
}

const TimeSeriesSchema = new Schema({
    timestamp: { type: Date, required: true },
    value: { type: Number, required: true }
}, { _id: false });

const tokenSchema = new Schema<IToken>({
    mintAddress: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, trim: true, uppercase: true },
    createdAt: { type: Date, required: true },
    creator: { type: String, required: true, trim: true, index: true },
    currentVolume: { type: Number, required: true, default: 0, min: 0 },
    currentPrice: { type: Number, required: true, default: 0, min: 0 },
    holderCount: { type: Number, required: true, default: 0, min: 0 },
    liquidityAmount: { type: Number, required: true, default: 0, min: 0 },
    volumeHistory: { type: [TimeSeriesSchema], default: [] } as any,
    priceHistory: { type: [TimeSeriesSchema], default: [] } as any,
    holderHistory: { type: [TimeSeriesSchema], default: [] } as any,
    potentialScore: { type: Number, required: true, default: 0, min: 0, max: 100 },
    volumeGrowthRate: { type: Number, required: true, default: 0 },
    isGraduated: { type: Boolean, required: true, default: false },
    isActive: { type: Boolean, required: true, default: true },
    lastUpdated: { type: Date, required: true, default: Date.now },
    detectedPatterns: [{ type: String }],
    graduatedAt: { type: Date }
}, { timestamps: true, versionKey: false });

tokenSchema.index({ potentialScore: -1 });
tokenSchema.index({ currentVolume: -1 });
tokenSchema.index({ isActive: 1, isGraduated: 1 });
tokenSchema.index({ createdAt: -1 });

tokenSchema.virtual('isNearGraduation').get(function(this: IToken) {
    return this.currentVolume >= 50000 && this.currentVolume < 69000;
});

tokenSchema.methods.updateTimeSeriesData = async function(field: 'volume' | 'price' | 'holders', value: number): Promise<void> {
    const historyField = `${field}History`;
    const currentField = field === 'holders' ? 'holderCount' : `current${field.charAt(0).toUpperCase() + field.slice(1)}`;

    if (!this[historyField]) this[historyField] = [];
    this[historyField].push({
        timestamp: new Date(),
        value
    });
    this.markModified(historyField);

    this[currentField] = value;
    this.lastUpdated = new Date();

    try {
        await this.save();
        logger.info(`Updated ${field} data for token ${this.mintAddress}`);
    } catch (error) {
        logger.error(`Error updating ${field} data for token ${this.mintAddress}:`, error);
        throw error;
    }
};

tokenSchema.methods.addPattern = async function(
    this: IToken,
    pattern: any
): Promise<IToken> {
    this.detectedPatterns.push(pattern);
    return this.save();
};

tokenSchema.methods.graduate = async function(
    this: IToken
): Promise<IToken> {
    if (!this.isGraduated) {
        this.isGraduated = true;
        this.graduatedAt = new Date();
        return this.save();
    }
    return this;
};

tokenSchema.statics.findNearGraduation = function(): Promise<IToken[]> {
    return this.find({
        isActive: true,
        isGraduated: false,
        currentVolume: { $gte: 50000, $lt: 69000 }
    }).sort({ currentVolume: -1 });
};

tokenSchema.statics.findTopPotential = function(limit: number = 10): Promise<IToken[]> {
    return this.find({
        isActive: true,
        isGraduated: false
    })
    .sort({ potentialScore: -1 })
    .limit(limit);
};

const Token = (models.Token || model<IToken, ITokenModel>('Token', tokenSchema)) as ITokenModel;

export default Token; 