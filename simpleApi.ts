import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/memecoin';

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Import Token model
const Token = require('./src/models/token').default;

// Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/tokens/latest', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const tokens = await Token.find().sort({ createdAt: -1 }).limit(limit);
    res.json({ status: 'success', results: tokens.length, data: tokens });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch tokens' });
  }
});

app.get('/api/tokens/:address', async (req: Request, res: Response) => {
  try {
    const token = await Token.findOne({ mintAddress: req.params.address });
    if (!token) {
      return res.status(404).json({ status: 'error', message: 'Token not found' });
    }
    res.json({ status: 'success', data: token });
  } catch (error) {
    console.error('Error fetching token:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch token' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api`);
});
