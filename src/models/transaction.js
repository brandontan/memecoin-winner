const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Core transaction identifiers
  signature: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  tokenAddress: { 
    type: String, 
    required: true,
    index: true
  },
  
  // Transaction metadata
  blockTime: { type: Number, required: true },
  timestamp: { type: Date, required: true, index: true },
  slot: { type: Number },
  
  // Transaction details
  transactionType: {
    type: String,
    enum: ['buy', 'sell', 'transfer', 'liquidity_add', 'liquidity_remove', 'unknown'],
    default: 'unknown'
  },
  
  // Wallet information
  fromWallet: { type: String },
  toWallet: { type: String },
  involvedWallets: [{ type: String }],
  
  // Value information
  amount: { type: Number },
  usdValue: { type: Number },
  
  // Liquidity information
  isLiquidityOperation: { type: Boolean, default: false },
  liquidityChangeAmount: { type: Number },
  
  // Raw data for future analysis
  rawData: { type: mongoose.Schema.Types.Mixed },
  
  // Processing metadata
  processed: { type: Boolean, default: false },
  processingErrors: [{ type: String }]
}, { timestamps: true });

// Create indexes for efficient querying
transactionSchema.index({ tokenAddress: 1, timestamp: -1 });
transactionSchema.index({ tokenAddress: 1, transactionType: 1 });
transactionSchema.index({ tokenAddress: 1, isLiquidityOperation: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
