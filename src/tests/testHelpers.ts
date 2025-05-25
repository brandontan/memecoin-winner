import { IToken } from '../models/token';

export const simulateHighPerformanceGrowth = async (token: IToken): Promise<void> => {
  // Simulate rapid growth in volume and price
  for (let i = 0; i < 12; i++) {
    const newVolume = (token.currentVolume || 1000) * (1 + Math.random() * 0.5);
    const newPrice = (token.currentPrice || 0.001) * (1 + Math.random() * 0.2);
    const newHolders = (token.holderCount || 10) + Math.floor(Math.random() * 10);
    
    // Update token metrics directly
    token.currentVolume = newVolume;
    token.currentPrice = newPrice;
    token.holderCount = newHolders;
    token.liquidityAmount = (token.liquidityAmount || 1000) * (1 + Math.random() * 0.1);
    token.potentialScore = Math.min(100, (token.potentialScore || 0) + 5 + Math.random() * 5);
    
    // Add to history
    token.priceHistory = token.priceHistory || [];
    token.volumeHistory = token.volumeHistory || [];
    token.holderHistory = token.holderHistory || [];
    
    token.priceHistory.push({ timestamp: new Date(), price: newPrice });
    token.volumeHistory.push({ timestamp: new Date(), volume: newVolume });
    token.holderHistory.push({ timestamp: new Date(), count: newHolders });
    
    await token.save();
  }
};

export const simulateAveragePerformanceGrowth = async (token: IToken): Promise<void> => {
  // Simulate moderate growth
  for (let i = 0; i < 12; i++) {
    const newVolume = (token.currentVolume || 500) * (1 + (Math.random() * 0.2 - 0.1));
    const newPrice = (token.currentPrice || 0.0005) * (1 + (Math.random() * 0.1 - 0.05));
    const newHolders = (token.holderCount || 5) + Math.floor(Math.random() * 3);
    
    // Update token metrics directly
    token.currentVolume = newVolume;
    token.currentPrice = newPrice;
    token.holderCount = newHolders;
    token.liquidityAmount = (token.liquidityAmount || 500) * (1 + (Math.random() * 0.05 - 0.025));
    token.potentialScore = Math.min(100, (token.potentialScore || 0) + 1 + Math.random() * 2);
    
    // Add to history
    token.priceHistory = token.priceHistory || [];
    token.volumeHistory = token.volumeHistory || [];
    token.holderHistory = token.holderHistory || [];
    
    token.priceHistory.push({ timestamp: new Date(), price: newPrice });
    token.volumeHistory.push({ timestamp: new Date(), volume: newVolume });
    token.holderHistory.push({ timestamp: new Date(), count: newHolders });
    
    await token.save();
  }
};

export const simulatePoorPerformance = async (token: IToken): Promise<void> => {
  // Simulate declining performance
  for (let i = 0; i < 12; i++) {
    const newVolume = (token.currentVolume || 100) * (0.8 + Math.random() * 0.3);
    const newPrice = (token.currentPrice || 0.0001) * (0.9 + Math.random() * 0.1);
    const newHolders = Math.max(1, (token.holderCount || 2) - Math.floor(Math.random() * 2));
    
    // Update token metrics directly
    token.currentVolume = newVolume;
    token.currentPrice = newPrice;
    token.holderCount = newHolders;
    token.liquidityAmount = (token.liquidityAmount || 100) * (0.9 + Math.random() * 0.1);
    token.potentialScore = Math.max(0, (token.potentialScore || 10) - 2 - Math.random() * 3);
    
    // Add to history
    token.priceHistory = token.priceHistory || [];
    token.volumeHistory = token.volumeHistory || [];
    token.holderHistory = token.holderHistory || [];
    
    token.priceHistory.push({ timestamp: new Date(), price: newPrice });
    token.volumeHistory.push({ timestamp: new Date(), volume: newVolume });
    token.holderHistory.push({ timestamp: new Date(), count: newHolders });
    
    await token.save();
  }
};
