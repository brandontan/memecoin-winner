const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  // Basic identifiers
  address: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  creator: {
    type: String,
    required: true
  },
  
  // Launch info
  launchTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Current metrics (updated in real-time)
  volume: {
    type: Number,
    default: 0
  },
  buyers: {
    type: Number,
    default: 0
  },
  priceUSD: {
    type: Number,
    default: 0
  },
  
  // Simple scoring
  score: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Alert tracking
  alertSent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for queries
tokenSchema.index({ score: -1 });
tokenSchema.index({ launchTime: -1 });

// Simple scoring method: volume × buyers ÷ time_since_launch_hours
tokenSchema.methods.calculateScore = function() {
  const hoursSinceLaunch = (Date.now() - this.launchTime) / (1000 * 60 * 60);
  const timeFactor = Math.max(hoursSinceLaunch, 0.1); // Avoid division by zero
  
  this.score = Math.min(100, Math.round((this.volume * this.buyers) / timeFactor / 1000));
  return this.score;
};

// Check if token should trigger alert
tokenSchema.methods.shouldAlert = function() {
  return this.score >= 80 && !this.alertSent;
};

// Mark alert as sent
tokenSchema.methods.markAlertSent = function() {
  this.alertSent = true;
  return this.save();
};

module.exports = mongoose.model('Token', tokenSchema);