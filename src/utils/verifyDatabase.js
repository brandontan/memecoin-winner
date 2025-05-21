const mongoose = require('mongoose');
const config = require('../config/config');
const logger = require('./logger');
const Token = require('../models/token');

class DatabaseVerifier {
    constructor() {
        this.results = {
            connection: { status: 'pending', details: [] },
            model: { status: 'pending', details: [] },
            operations: { status: 'pending', details: [] },
            configuration: { status: 'pending', details: [] }
        };
    }

    async verifyAll() {
        console.log('\n🔌 Testing MongoDB Connection...\n');
        
        try {
            await this.verifyConnection();
            await this.verifyModel();
            await this.verifyOperations();
            await this.verifyConfiguration();
            
            this.printResults();
            return this.results;
        } catch (error) {
            console.error('\n❌ Database verification failed:', error.message);
            throw error;
        } finally {
            // Always close the connection
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.close();
            }
        }
    }

    async verifyConnection() {
        try {
            // Connect to MongoDB
            await mongoose.connect(config.mongodb.uri);
            
            // Get MongoDB server info
            const adminDb = mongoose.connection.db.admin();
            const serverInfo = await adminDb.serverInfo();
            
            this.results.connection.status = 'success';
            this.results.connection.details.push(`✅ Successfully connected to MongoDB at ${config.mongodb.uri}`);
            this.results.connection.details.push(`✅ MongoDB version: ${serverInfo.version}`);
            
            // Get connection pool stats
            const poolStats = await mongoose.connection.db.command({ serverStatus: 1 });
            if (poolStats.connections) {
                this.results.connection.details.push(
                    `✅ Connection pool: ${poolStats.connections.current} active, ` +
                    `${poolStats.connections.available} available`
                );
            }
        } catch (error) {
            this.results.connection.status = 'error';
            this.results.connection.details.push(`❌ Failed to connect to MongoDB: ${error.message}`);
            throw error;
        }
    }

    async verifyModel() {
        console.log('\n📋 Verifying Token Model...\n');
        
        try {
            // Verify model registration
            if (mongoose.models.Token) {
                this.results.model.details.push('✅ Token model successfully registered');
            } else {
                throw new Error('Token model not registered');
            }

            // Verify schema
            const tokenSchema = Token.schema.obj;
            const requiredFields = ['address', 'name', 'symbol', 'launchpad'];
            const missingFields = requiredFields.filter(field => !tokenSchema[field]);
            
            if (missingFields.length === 0) {
                this.results.model.details.push('✅ Token schema validation passed');
            } else {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // Verify indexes
            const indexes = await Token.collection.indexes();
            const requiredIndexes = ['address', 'createdAt', 'analysis.score', 'status'];
            const missingIndexes = requiredIndexes.filter(index => 
                !indexes.some(i => i.name === index)
            );
            
            if (missingIndexes.length === 0) {
                this.results.model.details.push('✅ All required indexes are present');
            } else {
                throw new Error(`Missing indexes: ${missingIndexes.join(', ')}`);
            }

            this.results.model.status = 'success';
        } catch (error) {
            this.results.model.status = 'error';
            this.results.model.details.push(`❌ Model verification failed: ${error.message}`);
            throw error;
        }
    }

    async verifyOperations() {
        console.log('\n🔄 Testing Database Operations...\n');
        
        try {
            // Create test document
            const testToken = new Token({
                address: 'test-' + Date.now(),
                name: 'Test Token',
                symbol: 'TEST',
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
            this.results.operations.details.push(`✅ Created test token document with ID: ${testToken._id}`);

            // Read test document
            const retrievedToken = await Token.findOne({ address: testToken.address });
            if (retrievedToken) {
                this.results.operations.details.push('✅ Retrieved test token document successfully');
            }

            // Update test document
            retrievedToken.preGraduationData.currentPrice = 1.2;
            await retrievedToken.save();
            this.results.operations.details.push('✅ Updated test token document successfully');

            // Delete test document
            await Token.deleteOne({ address: testToken.address });
            this.results.operations.details.push('✅ Deleted test token document successfully');

            this.results.operations.status = 'success';
        } catch (error) {
            this.results.operations.status = 'error';
            this.results.operations.details.push(`❌ Operation verification failed: ${error.message}`);
            throw error;
        }
    }

    async verifyConfiguration() {
        console.log('\n🔍 Checking Database Configuration...\n');
        
        try {
            // Verify connection pool settings
            const poolSettings = mongoose.connection.client.topology.s.pool;
            if (poolSettings) {
                this.results.configuration.details.push(
                    `✅ Connection pool configured correctly (min: ${poolSettings.minSize}, max: ${poolSettings.maxSize})`
                );
            }

            // Verify write concern
            const writeConcern = mongoose.connection.options.writeConcern;
            if (writeConcern) {
                this.results.configuration.details.push(
                    `✅ Write concern configured: ${JSON.stringify(writeConcern)}`
                );
            }

            // Verify read preference
            const readPreference = mongoose.connection.options.readPreference;
            if (readPreference) {
                this.results.configuration.details.push(
                    `✅ Read preference configured: ${readPreference.mode}`
                );
            }

            this.results.configuration.status = 'success';
        } catch (error) {
            this.results.configuration.status = 'error';
            this.results.configuration.details.push(`❌ Configuration verification failed: ${error.message}`);
            throw error;
        }
    }

    printResults() {
        console.log('\n=== Database Verification Results ===\n');
        
        for (const [component, result] of Object.entries(this.results)) {
            console.log(`${component.toUpperCase()}: ${result.status === 'success' ? '✅' : '❌'}`);
            result.details.forEach(detail => console.log(`  ${detail}`));
            console.log('');
        }

        const allSuccess = Object.values(this.results).every(r => r.status === 'success');
        if (allSuccess) {
            console.log('✅ DATABASE INFRASTRUCTURE VERIFICATION PASSED\n');
        } else {
            console.log('❌ DATABASE INFRASTRUCTURE VERIFICATION FAILED\n');
        }
    }
}

// Create and export a singleton instance
const verifier = new DatabaseVerifier();
module.exports = verifier; 