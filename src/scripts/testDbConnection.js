require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Test schema
const TestSchema = new mongoose.Schema({
    testId: String,
    timestamp: { type: Date, default: Date.now },
    status: String
});

// Create a temporary model
const TestModel = mongoose.model('TestConnection', TestSchema);

async function testConnection() {
    console.log('\n🔌 Testing MongoDB Connection...\n');
    
    try {
        // Connect to MongoDB
        const MONGODB_URI = process.env.MONGODB_URI;
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in .env file');
        }

        await mongoose.connect(MONGODB_URI);
        console.log('✅ Successfully connected to MongoDB\n');

        // Get connection details
        const db = mongoose.connection.db;
        const adminDb = db.admin();
        const serverInfo = await adminDb.serverInfo();
        
        console.log('📊 Connection Details:');
        console.log(`   - MongoDB Version: ${serverInfo.version}`);
        console.log(`   - Server Type: ${serverInfo.serverType}`);
        console.log(`   - Host: ${mongoose.connection.host}`);
        console.log(`   - Port: ${mongoose.connection.port}`);
        console.log(`   - Database: ${mongoose.connection.name}\n`);

        // Create test document
        const testDoc = new TestModel({
            testId: 'connection-test-' + Date.now(),
            status: 'success'
        });

        await testDoc.save();
        console.log('✅ Test document created successfully');
        console.log(`   - Document ID: ${testDoc._id}`);
        console.log(`   - Timestamp: ${testDoc.timestamp}\n`);

        // Verify document was saved
        const retrievedDoc = await TestModel.findById(testDoc._id);
        if (retrievedDoc) {
            console.log('✅ Document verification successful');
            console.log(`   - Retrieved document matches created document\n`);
        }

        // Clean up test document
        await TestModel.deleteOne({ _id: testDoc._id });
        console.log('🧹 Test document cleaned up\n');

        console.log('✅ Database connection test completed successfully!\n');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Connection Test Failed:');
        console.error('Error details:', error.message);
        
        // Provide troubleshooting guidance based on error type
        if (error.name === 'MongoServerSelectionError') {
            console.log('\n🔍 Troubleshooting Tips:');
            console.log('1. Check if your IP address is whitelisted in MongoDB Atlas');
            console.log('2. Verify your connection string is correct');
            console.log('3. Ensure your MongoDB Atlas cluster is running');
            console.log('4. Check if your database user credentials are correct');
        } else if (error.name === 'MongoParseError') {
            console.log('\n🔍 Troubleshooting Tips:');
            console.log('1. Verify your MONGODB_URI format is correct');
            console.log('2. Check for special characters in username/password');
            console.log('3. Ensure the URI is properly URL encoded');
        }
        
        process.exit(1);
    } finally {
        // Close the connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
    }
}

// Run the test
testConnection(); 