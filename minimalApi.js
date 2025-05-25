const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import services and utilities
const { analyzeCreator } = require('./src/utils/solanaUtils');
const { 
  collectTokenTransactions,
  getTokenTransactions,
  getTokenTransactionStats 
} = require('./src/services/transactionCollector');
const { getEnhancedScore } = require('./src/services/scoringService');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root to the clean table layout
app.get('/', (req, res) => {
    res.redirect('/clean-table.html');
});

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB - ensure we're using the memecoin database
const MONGODB_URI = 'mongodb://localhost:27017/memecoin';

// Token Schema that matches our actual data structure
const tokenSchema = new mongoose.Schema({
  mintAddress: { type: String, index: true },
  name: String,
  symbol: String,
  creator: String,
  currentPrice: Number,
  currentVolume: Number,
  holderCount: Number,
  liquidityAmount: Number,
  potentialScore: Number,
  volumeGrowthRate: Number,
  detectedPatterns: [String],
  isGraduated: Boolean,
  isActive: Boolean,
  volumeHistory: [Number],
  priceHistory: [Number],
  holderHistory: [Number],
  lastUpdated: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create Token model
const Token = mongoose.model('Token', tokenSchema);

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/tokens/latest', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const tokens = await Token.find()
      .select('mintAddress name symbol creator currentPrice potentialScore holderCount createdAt')
      .sort({ createdAt: -1 })
      .limit(limit);
    
    // Calculate enhanced scores for all tokens
    const enhancedTokens = await Promise.all(tokens.map(async (token) => {
      const enhancedScore = await getEnhancedScore(token);
      return {
        ...token.toObject(),
        enhancedScore,
        potentialScore: enhancedScore // Replace with enhanced score
      };
    }));
    
    res.json({ 
      status: 'success', 
      results: enhancedTokens.length, 
      data: enhancedTokens 
    });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch tokens' });
  }
});

app.get('/api/tokens/:mintAddress', async (req, res) => {
  try {
    const token = await Token.findOne({ mintAddress: req.params.mintAddress });
    if (!token) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Token not found' 
      });
    }
    
    // Calculate enhanced score in real-time
    const enhancedScore = await getEnhancedScore(token);
    
    // Format the response to include relevant fields
    const tokenData = {
      mintAddress: token.mintAddress,
      name: token.name,
      symbol: token.symbol,
      creator: token.creator,
      price: token.currentPrice,
      score: enhancedScore, // Use real-time enhanced score
      oldScore: token.potentialScore, // Keep original score for comparison
      holders: token.holderCount,
      liquidity: token.liquidityAmount,
      volume24h: token.currentVolume,
      createdAt: token.createdAt,
      lastUpdated: token.lastUpdated
    };
    
    res.json({ 
      status: 'success', 
      data: tokenData 
    });
  } catch (error) {
    console.error('Error fetching token:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch token',
      error: error.message 
    });
  }
});

// Transaction collection endpoints
app.get('/api/tokens/:mintAddress/transactions', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    const { start, end, limit, type } = req.query;
    
    // Parse query parameters
    const options = {};
    if (start) options.startTime = new Date(start);
    if (end) options.endTime = new Date(end);
    if (limit) options.limit = parseInt(limit);
    if (type) options.type = type;
    
    // Get transactions
    const transactions = await getTokenTransactions(mintAddress, options);
    
    res.json({
      status: 'success',
      results: transactions.length,
      data: transactions
    });
  } catch (error) {
    console.error('Error fetching token transactions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch token transactions',
      error: error.message
    });
  }
});

app.get('/api/tokens/:mintAddress/transactions/stats', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    const { timeframe } = req.query; // Optional timeframe parameter (e.g., '24h', '7d')
    
    // Get transaction stats
    const stats = await getTokenTransactionStats(mintAddress);
    
    // Get additional analytics
    const Transaction = mongoose.model('Transaction');
    
    // Calculate buy vs sell volume
    const volumeByType = await Transaction.aggregate([
      { $match: { tokenAddress: mintAddress, amount: { $exists: true, $gt: 0 } } },
      { $group: { 
          _id: '$transactionType', 
          totalVolume: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);
    
    // Format volume data
    const volumeData = {};
    volumeByType.forEach(item => {
      volumeData[item._id] = {
        totalVolume: item.totalVolume,
        count: item.count,
        avgAmount: item.avgAmount
      };
    });
    
    // Get most active trading hours
    const hourlyActivity = await Transaction.aggregate([
      { $match: { tokenAddress: mintAddress } },
      { $group: {
          _id: { hour: { $hour: '$timestamp' } },
          count: { $sum: 1 },
          volume: { $sum: { $ifNull: ['$amount', 0] } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 24 }
    ]);
    
    // Format hourly data
    const hourlyData = hourlyActivity.map(item => ({
      hour: item._id.hour,
      count: item.count,
      volume: item.volume
    }));
    
    // Get wallet activity metrics
    const walletMetrics = await Transaction.aggregate([
      { $match: { tokenAddress: mintAddress } },
      { $group: {
          _id: null,
          uniqueFromWallets: { $addToSet: '$fromWallet' },
          uniqueToWallets: { $addToSet: '$toWallet' },
          uniqueInvolvedWallets: { $addToSet: { $arrayElemAt: ['$involvedWallets', 0] } }
        }
      }
    ]);
    
    // Calculate wallet metrics
    const walletData = walletMetrics.length > 0 ? {
      uniqueFromWallets: walletMetrics[0].uniqueFromWallets.filter(Boolean).length,
      uniqueToWallets: walletMetrics[0].uniqueToWallets.filter(Boolean).length,
      totalUniqueWallets: walletMetrics[0].uniqueInvolvedWallets.filter(Boolean).length
    } : { uniqueFromWallets: 0, uniqueToWallets: 0, totalUniqueWallets: 0 };
    
    // Enhance the response with the additional data
    const enhancedStats = {
      ...stats,
      volumeByType: volumeData,
      mostActiveHours: hourlyData,
      walletMetrics: walletData
    };
    
    res.json({
      status: 'success',
      data: enhancedStats
    });
  } catch (error) {
    console.error('Error fetching token transaction stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch token transaction statistics',
      error: error.message
    });
  }
});

app.post('/api/tokens/:mintAddress/transactions/collect', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    const { maxTransactions, forceUpdate } = req.body || {};
    
    // Start the collection process
    const result = await collectTokenTransactions(mintAddress, {
      maxTransactions: maxTransactions || 1000,
      forceUpdate: forceUpdate || false
    });
    
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error collecting token transactions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to collect token transactions',
      error: error.message
    });
  }
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });
    console.log('✅ Connected to MongoDB');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 API available at http://localhost:${PORT}/api`);
      
      // Test route
      console.log(`🌐 Test health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});
