const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const config = require('../../config/config');
const logger = require('../../utils/logger');
const Token = require('../../models/Token');

class LaunchpadMonitor {
    constructor() {
        this.connection = new Connection(config.solana.rpcUrl);
        this.wsConnection = new Connection(config.solana.wsUrl);
        this.subscriptions = new Map();
        this.graduationChecks = new Map();
    }

    async startMonitoring() {
        try {
            // Monitor Pump.fun
            await this.monitorLaunchpad(
                config.launchpads.pumpFun.programId,
                'pump.fun'
            );

            // Monitor LetsBonk.fun
            await this.monitorLaunchpad(
                config.launchpads.letsBonk.programId,
                'letsbonk.fun'
            );

            // Start graduation check intervals
            this.startGraduationChecks();

            logger.info('Launchpad monitoring started successfully');
        } catch (error) {
            logger.error('Failed to start launchpad monitoring:', error);
            throw error;
        }
    }

    async monitorLaunchpad(programId, launchpadName) {
        try {
            const publicKey = new PublicKey(programId);
            
            // Subscribe to program account changes
            const subscriptionId = this.wsConnection.onProgramAccountChange(
                publicKey,
                async (accountInfo, context) => {
                    try {
                        await this.handleNewToken(accountInfo, launchpadName);
                    } catch (error) {
                        logger.error(`Error handling new token on ${launchpadName}:`, error);
                    }
                },
                'confirmed'
            );

            this.subscriptions.set(launchpadName, subscriptionId);
            logger.info(`Started monitoring ${launchpadName}`);
        } catch (error) {
            logger.error(`Failed to monitor ${launchpadName}:`, error);
            throw error;
        }
    }

    async handleNewToken(accountInfo, launchpadName) {
        try {
            // Parse account data to extract token information
            const tokenData = await this.parseTokenData(accountInfo, launchpadName);
            
            // Check if token already exists
            const existingToken = await Token.findOne({ address: tokenData.address });
            if (existingToken) {
                logger.debug(`Token ${tokenData.address} already exists`);
                return;
            }

            // Create new token record
            const token = new Token(tokenData);
            await token.save();

            logger.info(`New token detected on ${launchpadName}: ${tokenData.symbol} (${tokenData.address})`);
            
            // Start monitoring this token's graduation progress
            this.startTokenMonitoring(token);
        } catch (error) {
            logger.error('Error handling new token:', error);
            throw error;
        }
    }

    async parseTokenData(accountInfo, launchpadName) {
        try {
            // TODO: Implement proper parsing based on launchpad program structure
            // This is a placeholder implementation
            const tokenData = {
                address: accountInfo.pubkey.toString(),
                name: 'Unknown', // Will be updated with actual data
                symbol: 'UNKNOWN', // Will be updated with actual data
                launchpad: launchpadName,
                status: 'monitoring',
                preGraduationData: {
                    initialPrice: 0,
                    currentPrice: 0,
                    volume24h: 0,
                    totalVolume: 0,
                    liquidity: 0,
                    holders: 0,
                    graduationProgress: 0,
                    lastUpdated: new Date()
                }
            };

            // If launchpad has API, fetch additional data
            if (launchpadName === 'pump.fun' && config.launchpads.pumpFun.apiEndpoint) {
                try {
                    const apiData = await this.fetchLaunchpadData(tokenData.address);
                    Object.assign(tokenData, apiData);
                } catch (error) {
                    logger.warn(`Failed to fetch additional data from ${launchpadName} API:`, error);
                }
            }

            return tokenData;
        } catch (error) {
            logger.error('Error parsing token data:', error);
            throw error;
        }
    }

    async fetchLaunchpadData(tokenAddress) {
        try {
            const response = await axios.get(`${config.launchpads.pumpFun.apiEndpoint}/tokens/${tokenAddress}`);
            return response.data;
        } catch (error) {
            logger.error('Error fetching launchpad data:', error);
            throw error;
        }
    }

    startTokenMonitoring(token) {
        const checkInterval = setInterval(async () => {
            try {
                await this.checkTokenProgress(token);
            } catch (error) {
                logger.error(`Error checking token progress for ${token.address}:`, error);
            }
        }, config.monitoring.updateInterval);

        this.graduationChecks.set(token.address, checkInterval);
    }

    async checkTokenProgress(token) {
        try {
            // Fetch current trading data
            const tradingData = await this.fetchTokenTradingData(token);
            
            // Update pre-graduation data
            await token.updatePreGraduationData(tradingData);

            // Check if token has graduated
            if (this.hasTokenGraduated(token)) {
                await this.handleTokenGraduation(token);
            }

            // Update analysis
            await this.updateTokenAnalysis(token);
        } catch (error) {
            logger.error(`Error checking progress for token ${token.address}:`, error);
            throw error;
        }
    }

    async fetchTokenTradingData(token) {
        // TODO: Implement actual data fetching from launchpad
        // This is a placeholder implementation
        return {
            currentPrice: 0,
            volume24h: 0,
            totalVolume: 0,
            liquidity: 0,
            holders: 0,
            graduationProgress: 0
        };
    }

    hasTokenGraduated(token) {
        const threshold = config.launchpads[token.launchpad.replace('.', '')].graduationThreshold;
        return token.preGraduationData.totalVolume >= threshold;
    }

    async handleTokenGraduation(token) {
        try {
            // Mark token as graduated
            await token.markAsGraduated();

            // Stop graduation checks for this token
            const checkInterval = this.graduationChecks.get(token.address);
            if (checkInterval) {
                clearInterval(checkInterval);
                this.graduationChecks.delete(token.address);
            }

            logger.info(`Token ${token.symbol} (${token.address}) has graduated!`);

            // TODO: Emit graduation event for other services
        } catch (error) {
            logger.error(`Error handling graduation for token ${token.address}:`, error);
            throw error;
        }
    }

    async updateTokenAnalysis(token) {
        // TODO: Implement token analysis logic
        const analysis = {
            score: 0,
            confidence: 0,
            patterns: [],
            graduationPrediction: {
                probability: 0,
                estimatedTime: null,
                factors: []
            }
        };

        await token.updateAnalysis(analysis);
    }

    startGraduationChecks() {
        setInterval(async () => {
            try {
                const tokens = await Token.find({
                    status: 'monitoring',
                    'postGraduationData.isGraduated': false
                });

                for (const token of tokens) {
                    await this.checkTokenProgress(token);
                }
            } catch (error) {
                logger.error('Error in graduation check interval:', error);
            }
        }, config.monitoring.graduationCheckInterval);
    }

    async stopMonitoring() {
        try {
            // Stop all program subscriptions
            for (const [launchpad, subscriptionId] of this.subscriptions) {
                await this.wsConnection.removeProgramAccountChangeListener(subscriptionId);
                logger.info(`Stopped monitoring ${launchpad}`);
            }
            this.subscriptions.clear();

            // Stop all graduation checks
            for (const [tokenAddress, checkInterval] of this.graduationChecks) {
                clearInterval(checkInterval);
                logger.info(`Stopped graduation checks for token ${tokenAddress}`);
            }
            this.graduationChecks.clear();
        } catch (error) {
            logger.error('Error stopping launchpad monitoring:', error);
            throw error;
        }
    }
}

module.exports = new LaunchpadMonitor(); 