const mongoose = require('mongoose');
const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const config = require('../config/config');
const logger = require('./logger');
const Token = require('../models/token');

class InfrastructureValidator {
    constructor() {
        this.results = {
            database: { status: 'pending', details: [] },
            models: { status: 'pending', details: [] },
            solana: { status: 'pending', details: [] },
            api: { status: 'pending', details: [] },
            services: { status: 'pending', details: [] },
            environment: { status: 'pending', details: [] }
        };
    }

    async validateAll() {
        logger.info('Starting comprehensive infrastructure validation...');
        
        try {
            await this.validateDatabase();
            await this.validateModels();
            await this.validateSolanaConnection();
            await this.validateApiEndpoints();
            await this.validateServices();
            await this.validateEnvironment();
            
            this.printResults();
            return this.results;
        } catch (error) {
            logger.error('Infrastructure validation failed:', error);
            throw error;
        }
    }

    async validateDatabase() {
        logger.info('Validating database connectivity...');
        
        try {
            // Test connection
            await mongoose.connect(config.mongodb.uri);
            this.results.database.details.push('Successfully connected to MongoDB');
            
            // Test basic CRUD operations
            const testToken = new Token({
                address: 'test-' + Date.now(),
                name: 'Test Token',
                symbol: 'TEST',
                launchpad: 'pump.fun'
            });
            
            await testToken.save();
            this.results.database.details.push('Successfully created test token');
            
            const retrievedToken = await Token.findOne({ address: testToken.address });
            if (retrievedToken) {
                this.results.database.details.push('Successfully retrieved test token');
            }
            
            await Token.deleteOne({ address: testToken.address });
            this.results.database.details.push('Successfully deleted test token');
            
            // Verify indexes
            const indexes = await Token.collection.indexes();
            const requiredIndexes = ['address', 'createdAt', 'analysis.score', 'status'];
            const missingIndexes = requiredIndexes.filter(index => 
                !indexes.some(i => i.name === index)
            );
            
            if (missingIndexes.length === 0) {
                this.results.database.details.push('All required indexes are present');
            } else {
                this.results.database.details.push(`Missing indexes: ${missingIndexes.join(', ')}`);
            }
            
            this.results.database.status = 'success';
        } catch (error) {
            this.results.database.status = 'error';
            this.results.database.details.push(`Database validation failed: ${error.message}`);
            throw error;
        }
    }

    async validateModels() {
        logger.info('Validating models...');
        
        try {
            // Verify Token model schema
            const tokenSchema = Token.schema.obj;
            const requiredFields = ['address', 'name', 'symbol', 'launchpad'];
            const missingFields = requiredFields.filter(field => !tokenSchema[field]);
            
            if (missingFields.length === 0) {
                this.results.models.details.push('Token model schema is valid');
            } else {
                this.results.models.details.push(`Missing required fields: ${missingFields.join(', ')}`);
            }
            
            // Test time-series data storage
            const testToken = new Token({
                address: 'test-ts-' + Date.now(),
                name: 'Test TS Token',
                symbol: 'TESTTS',
                launchpad: 'pump.fun',
                preGraduationData: {
                    initialPrice: 1.0,
                    currentPrice: 1.1,
                    volume24h: 1000,
                    totalVolume: 1000,
                    liquidity: 10000,
                    holders: 100,
                    graduationProgress: 50,
                    lastUpdated: new Date()
                }
            });
            
            await testToken.save();
            this.results.models.details.push('Successfully stored time-series data');
            
            await Token.deleteOne({ address: testToken.address });
            this.results.models.status = 'success';
        } catch (error) {
            this.results.models.status = 'error';
            this.results.models.details.push(`Model validation failed: ${error.message}`);
            throw error;
        }
    }

    async validateSolanaConnection() {
        logger.info('Validating Solana connectivity...');
        
        try {
            const connection = new Connection(config.solana.rpcUrl);
            
            // Test basic blockchain queries
            const slot = await connection.getSlot();
            this.results.solana.details.push(`Successfully queried current slot: ${slot}`);
            
            // Test program monitoring
            const programId = new PublicKey(config.launchpads.pumpFun.programId);
            const programInfo = await connection.getAccountInfo(programId);
            
            if (programInfo) {
                this.results.solana.details.push('Successfully verified Pump.fun program');
            } else {
                this.results.solana.details.push('Warning: Could not verify Pump.fun program');
            }
            
            this.results.solana.status = 'success';
        } catch (error) {
            this.results.solana.status = 'error';
            this.results.solana.details.push(`Solana validation failed: ${error.message}`);
            throw error;
        }
    }

    async validateApiEndpoints() {
        logger.info('Validating API endpoints...');
        
        try {
            // Test health endpoint
            const healthResponse = await axios.get(`http://localhost:${config.port}/health`);
            if (healthResponse.status === 200) {
                this.results.api.details.push('Health endpoint is responding');
            }
            
            // Test token endpoints
            const tokensResponse = await axios.get(`http://localhost:${config.port}/tokens`);
            if (tokensResponse.status === 200) {
                this.results.api.details.push('Token listing endpoint is responding');
            }
            
            // Test error handling
            try {
                await axios.get(`http://localhost:${config.port}/tokens/invalid-address`);
            } catch (error) {
                if (error.response?.status === 404) {
                    this.results.api.details.push('Error handling is working correctly');
                }
            }
            
            this.results.api.status = 'success';
        } catch (error) {
            this.results.api.status = 'error';
            this.results.api.details.push(`API validation failed: ${error.message}`);
            throw error;
        }
    }

    async validateServices() {
        logger.info('Validating services...');
        
        try {
            // Test monitoring service initialization
            const pumpFunMonitor = require('../services/pumpFunMonitor');
            await pumpFunMonitor.initializeMonitoring();
            this.results.services.details.push('Monitoring service initialized successfully');
            
            // Test data flow
            const testToken = new Token({
                address: 'test-service-' + Date.now(),
                name: 'Test Service Token',
                symbol: 'TESTSVC',
                launchpad: 'pump.fun'
            });
            
            await testToken.save();
            await pumpFunMonitor.trackTokenProgress(testToken.address);
            this.results.services.details.push('Token tracking service is working');
            
            await Token.deleteOne({ address: testToken.address });
            this.results.services.status = 'success';
        } catch (error) {
            this.results.services.status = 'error';
            this.results.services.details.push(`Service validation failed: ${error.message}`);
            throw error;
        }
    }

    async validateEnvironment() {
        logger.info('Validating environment configuration...');
        
        try {
            const requiredEnvVars = [
                'MONGODB_URI',
                'SOLANA_RPC_URL',
                'PUMP_FUN_PROGRAM_ID',
                'BIRDEYE_API_KEY'
            ];
            
            const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
            
            if (missingVars.length === 0) {
                this.results.environment.details.push('All required environment variables are set');
            } else {
                this.results.environment.details.push(`Missing environment variables: ${missingVars.join(', ')}`);
            }
            
            // Verify configuration
            if (config.nodeEnv === 'development') {
                this.results.environment.details.push('Running in development mode');
            } else if (config.nodeEnv === 'production') {
                this.results.environment.details.push('Running in production mode');
            }
            
            this.results.environment.status = 'success';
        } catch (error) {
            this.results.environment.status = 'error';
            this.results.environment.details.push(`Environment validation failed: ${error.message}`);
            throw error;
        }
    }

    printResults() {
        logger.info('\n=== Infrastructure Validation Results ===\n');
        
        for (const [component, result] of Object.entries(this.results)) {
            logger.info(`${component.toUpperCase()}: ${result.status}`);
            result.details.forEach(detail => logger.info(`  - ${detail}`));
            logger.info('');
        }
    }
}

// Create and export a singleton instance
const validator = new InfrastructureValidator();
module.exports = validator; 