require('dotenv').config();
const verifier = require('../utils/verifyDatabase');

async function runVerification() {
    try {
        console.log('Starting database verification...\n');
        const results = await verifier.verifyAll();
        
        // Check if any component failed
        const failedComponents = Object.entries(results)
            .filter(([_, result]) => result.status === 'error')
            .map(([component]) => component);
        
        if (failedComponents.length > 0) {
            console.error(`\n❌ Verification failed for components: ${failedComponents.join(', ')}`);
            process.exit(1);
        } else {
            console.log('\n✅ Database verification completed successfully!');
            process.exit(0);
        }
    } catch (error) {
        console.error('\n❌ Verification script failed:', error);
        process.exit(1);
    }
}

// Run the verification
runVerification(); 