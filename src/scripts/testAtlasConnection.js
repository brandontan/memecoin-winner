require('dotenv').config();
const { connect, mongoose } = require('../config/mongodb');
const logger = require('../utils/logger');

async function testConnection() {
    console.log('\n🔌 Testing MongoDB Atlas Connection...\n');
    
    try {
        // Attempt connection
        await connect();
        
        // Get MongoDB server info
        const adminDb = mongoose.connection.db.admin();
        const serverInfo = await adminDb.serverInfo();
        
        console.log('✅ Connection Details:');
        console.log(`   - MongoDB Version: ${serverInfo.version}`);
        console.log(`   - Server Type: ${serverInfo.serverType}`);
        console.log(`   - Host: ${mongoose.connection.host}`);
        console.log(`   - Port: ${mongoose.connection.port}`);
        console.log(`   - Database: ${mongoose.connection.name}`);
        
        // Check connection pool stats
        const poolStats = await mongoose.connection.db.command({ serverStatus: 1 });
        if (poolStats.connections) {
            console.log('\n📊 Connection Pool Stats:');
            console.log(`   - Active Connections: ${poolStats.connections.current}`);
            console.log(`   - Available Connections: ${poolStats.connections.available}`);
            console.log(`   - Max Connections: ${poolStats.connections.max}`);
        }
        
        // Check database stats
        const dbStats = await mongoose.connection.db.stats();
        console.log('\n💾 Database Stats:');
        console.log(`   - Storage Size: ${(dbStats.storageSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   - Data Size: ${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   - Index Size: ${(dbStats.indexSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   - Collections: ${dbStats.collections}`);
        console.log(`   - Documents: ${dbStats.objects}`);
        
        console.log('\n✅ MongoDB Atlas connection test completed successfully!\n');
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