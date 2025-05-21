const express = require('express');
const mongoose = require('mongoose');
const config = require('./config/config');
const logger = require('./utils/logger');
const tokenRoutes = require('./routes/tokenRoutes');
const pumpFunMonitor = require('./services/pumpFunMonitor');

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', tokenRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Something went wrong!',
        error: config.nodeEnv === 'development' ? err.message : undefined
    });
});

// Start server
let server;
const startServer = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(config.mongodb.uri);
        logger.info('Connected to MongoDB');

        // Start monitoring service
        await pumpFunMonitor.initializeMonitoring();
        logger.info('Pump.fun monitoring service initialized');

        // Start Express server
        server = app.listen(config.port, () => {
            logger.info(`Server is running on port ${config.port}`);
            logger.info(`Environment: ${config.nodeEnv}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Graceful shutdown
const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    
    try {
        // Stop monitoring service
        pumpFunMonitor.stop();
        logger.info('Monitoring service stopped');

        // Close server
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            logger.info('Server closed');
        }

        // Close database connection
        await mongoose.connection.close();
        logger.info('Database connection closed');

        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
};

// Handle process signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Promise Rejection:', err);
    shutdown();
});

// Start the server
startServer();

module.exports = app; 