require('dotenv').config();
const validator = require('../utils/validateInfrastructure');
const logger = require('../utils/logger');

async function runValidation() {
    try {
        logger.info('Starting infrastructure validation...');
        const results = await validator.validateAll();
        
        // Check if any component failed
        const failedComponents = Object.entries(results)
            .filter(([_, result]) => result.status === 'error')
            .map(([component]) => component);
        
        if (failedComponents.length > 0) {
            logger.error(`Validation failed for components: ${failedComponents.join(', ')}`);
            process.exit(1);
        } else {
            logger.info('All infrastructure components validated successfully!');
            process.exit(0);
        }
    } catch (error) {
        logger.error('Validation script failed:', error);
        process.exit(1);
    }
}

// Run the validation
runValidation(); 