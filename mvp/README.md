# Memecoin Predictor MVP

A simple, focused implementation that monitors Pump.fun for new token launches and alerts when high-potential opportunities are detected.

## What It Does

1. **Watches** Pump.fun for new token launches (every 5 seconds)
2. **Stores** basic token info (address, name, symbol, creator, launch time)
3. **Scores** tokens using simple math: `volume × buyers ÷ hours_since_launch`
4. **Alerts** when score reaches 80+ (console logs for MVP)

## Quick Start

1. **Install dependencies:**
   ```bash
   cd mvp
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your MongoDB URI
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

4. **Start the predictor:**
   ```bash
   npm start
   ```

## MVP Structure

```
mvp/
├── models/
│   └── token.js          # Simple token schema
├── services/
│   ├── monitor.js        # Watches Pump.fun
│   └── scorer.js         # Calculates scores
├── utils/
│   ├── database.js       # MongoDB connection
│   └── logger.js         # Simple logging
├── config.js             # Configuration
├── index.js              # Main entry point
└── test.js               # Simple tests
```

## Requirements

- Node.js 16+
- MongoDB (local or Atlas)
- Stable internet connection

## Configuration

Edit `.env` file:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/memecoin-mvp

# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Environment
NODE_ENV=development
LOG_LEVEL=info
```

## How It Works

### 1. Monitor Service
- Checks Pump.fun program every 5 seconds
- Detects new token creation transactions
- Extracts basic token metadata

### 2. Scoring Service
- Updates token metrics every 30 seconds
- Calculates score: `(volume × buyers) ÷ time_hours ÷ 1000`
- Caps score at 100

### 3. Alert System
- Triggers when score ≥ 80
- Logs alert to console
- Marks token as alerted (no duplicates)

## Example Output

```
info: 🚀 Starting Memecoin Predictor MVP...
info: ✅ Database connected
info: ✅ Monitor started
info: ✅ Scorer started
info: 🎯 Memecoin Predictor MVP is running!
info: New token detected: DogeCat (DCAT) - XYZ123...
info: 🚨 ALERT: High-potential token detected!
info:    Name: DogeCat (DCAT)
info:    Score: 85/100
info:    Volume: $12,500
info:    Buyers: 45
```

## Testing

Run the test suite:
```bash
npm test
```

Tests verify:
- Database connection
- Token model methods
- Scoring algorithm
- Alert logic

## Next Steps for Production

1. **Real DEX Integration**: Replace simulated metrics with Jupiter/Birdeye APIs
2. **Push Notifications**: Add email, SMS, webhook alerts
3. **Web Dashboard**: Simple React frontend
4. **API Endpoints**: REST API for external access
5. **Better Token Detection**: More robust Pump.fun parsing
6. **Historical Data**: Track token performance over time

## Troubleshooting

**Can't connect to MongoDB:**
- Check MongoDB is running
- Verify connection string in `.env`

**No tokens detected:**
- Confirm Solana RPC is working
- Check network connectivity
- Verify Pump.fun program ID is correct

**Tests failing:**
- Ensure MongoDB is accessible
- Clear any existing test data
- Check all dependencies are installed

## MVP Limitations

- Simulated trading metrics (no real DEX data yet)
- Console-only alerts
- Basic token detection
- No historical analysis
- Single launchpad support (Pump.fun only)

This MVP focuses on the core flow: **Watch → Store → Score → Alert**