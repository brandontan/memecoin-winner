const mongoose = require('mongoose');
const Token = require('../src/models/token');
const config = require('../config');

async function updateTokenModel() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Add holderDistribution field to all tokens with default empty array
    const result = await Token.updateMany(
      { holderDistribution: { $exists: false } },
      { $set: { holderDistribution: [] } }
    );

    console.log(`Updated ${result.nModified} tokens with holderDistribution field`);
    
    // For tokens with holderCount but no distribution, create a synthetic distribution
    const tokens = await Token.find({ 
      holderCount: { $gt: 0 },
      $or: [
        { holderDistribution: { $exists: false } },
        { holderDistribution: { $size: 0 } }
      ]
    });

    console.log(`Found ${tokens.length} tokens to update with synthetic distribution`);

    for (const token of tokens) {
      // Create a synthetic distribution based on holderCount
      const holderCount = token.holderCount || 1;
      const distribution = [];
      
      // Generate synthetic holder distribution
      for (let i = 0; i < Math.min(holderCount, 100); i++) {
        // Simulate Pareto distribution (80/20 rule)
        const balance = Math.random() < 0.8 
          ? Math.random() * 1000 
          : Math.random() * 10000;
          
        distribution.push({
          address: `synthetic_${i}`,
          balance: Math.round(balance * 100) / 100 // 2 decimal places
        });
      }
      
      // Update token with synthetic distribution
      token.holderDistribution = distribution;
      await token.save();
    }

    console.log('Successfully updated token models');
    process.exit(0);
  } catch (error) {
    console.error('Error updating token models:', error);
    process.exit(1);
  }
}

updateTokenModel();
