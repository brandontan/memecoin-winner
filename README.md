# Memecoin Winner Predictor

A first-of-its-kind predictive analytics platform that identifies promising early-stage memecoins on Solana within 24-48 hours of their creation.

## Core Features

- Real-time monitoring of Solana launchpads (Pump.fun, LetsBonk.fun)
- Trading pattern analysis across Solana DEXs via Jupiter API
- Statistical anomaly detection for successful memecoin patterns
- Plain-English explanations of detected opportunities
- Intuitive dashboard with real-time alerts

## Technical Stack

- **Backend**: Node.js, Express
- **Blockchain**: Solana Web3.js, Anchor
- **Database**: MongoDB
- **Frontend**: React
- **APIs**: Jupiter, Birdeye
- **Monitoring**: Winston for logging
- **Payments**: Stripe

## Setup Instructions

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   # Solana
   SOLANA_RPC_URL=
   SOLANA_WS_URL=
   
   # APIs
   JUPITER_API_KEY=
   BIRDEYE_API_KEY=
   
   # Database
   MONGODB_URI=
   
   # Stripe
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   
   # Server
   PORT=3000
   NODE_ENV=development
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Project Structure

```
src/
├── api/            # API routes and middleware
├── config/         # Configuration files
├── controllers/    # Request handlers
├── models/         # Database models
├── services/       # Business logic
│   ├── launchpad/  # Launchpad monitoring
│   ├── trading/    # Trading analysis
│   └── analysis/   # Pattern detection
└── utils/          # Helper functions
```

## Subscription Tiers

- **Basic** ($49/month): Real-time alerts for high-confidence opportunities
- **Pro** ($99/month): Additional opportunities, detailed analytics, historical data
- **Elite** ($199/month): Earlier detection, additional signals, private community

## Development Roadmap

1. **Phase 1** (Weeks 1-2): Launchpad monitoring implementation
2. **Phase 2** (Weeks 3-4): Trading data collection and basic anomaly detection
3. **Phase 3** (Weeks 5-7): Advanced pattern recognition and scoring system
4. **Phase 4** (Weeks 8-10): User interface and dashboard development
5. **Phase 5** (Weeks 11-12): Subscription system integration and launch preparation

## Contributing

Please read our contributing guidelines before submitting pull requests.

## License

ISC

## MongoDB Atlas Setup

### 1. Create a MongoDB Atlas Account
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Sign up for a free account
3. Verify your email address

### 2. Create a Free Cluster
1. Click "Build a Database"
2. Choose "FREE" tier (M0)
3. Select your preferred cloud provider (AWS, Google Cloud, or Azure)
4. Choose the region closest to your users
5. Click "Create Cluster"

### 3. Configure Network Access
1. In the Security section, click "Network Access"
2. Click "Add IP Address"
3. For development, you can click "Allow Access from Anywhere" (0.0.0.0/0)
4. Click "Confirm"

### 4. Create Database User
1. In the Security section, click "Database Access"
2. Click "Add New Database User"
3. Choose "Password" authentication
4. Enter a username and password (save these securely)
5. Under "Database User Privileges" select "Read and write to any database"
6. Click "Add User"

### 5. Get Connection String
1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Copy the connection string
4. Replace `<password>` with your database user's password
5. Add the connection string to your `.env` file:
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/memecoin-winner?retryWrites=true&w=majority
   ```

### Free Tier Limitations
- Storage: 512MB
- RAM: Shared
- Max connections: 100
- No dedicated support
- No backup service
- No advanced features

### Monitoring Usage
1. In Atlas dashboard, click "Metrics"
2. Monitor:
   - Storage usage
   - Connection count
   - Operation count
   - Query performance

### Testing Connection
Run the connection test:
```bash
npm run test-atlas
```

This will verify:
- Connection to Atlas
- Database access
- Connection pool configuration
- Basic database operations

### Troubleshooting
If you encounter connection issues:
1. Verify your IP is whitelisted
2. Check database user credentials
3. Ensure connection string is correct
4. Check cluster status in Atlas dashboard
5. Run `npm run test-atlas` for detailed diagnostics
<<<<<<< HEAD


=======
>>>>>>> origin/master
