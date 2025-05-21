import express, { Request, Response, NextFunction, Application } from 'express';
import { Server } from 'http';
import { config } from './config/config';
import { logger } from './utils/logger';
import { mongodb } from './config/mongodb';
import tokenRoutes from './routes/tokenRoutes';
import { pumpFunMonitor } from './services/pumpFunMonitor';

// Initialize Express app
const app: Application = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', tokenRoutes);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Something went wrong!',
        error: config.server.nodeEnv === 'development' ? err.message : undefined
    });
});

// Start server
let server: Server;
const startServer = async (): Promise<void> => {
    try {
        // Connect to MongoDB
        await mongodb.connect();
        logger.info('Connected to MongoDB');

        // Start monitoring service
        await pumpFunMonitor.initializeMonitoring();
        logger.info('Pump.fun monitoring service initialized');

        // Start Express server
        server = app.listen(config.server.port, () => {
            logger.info(`Server is running on port ${config.server.port}`);
            logger.info(`Environment: ${config.server.nodeEnv}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Graceful shutdown
const shutdown = async (): Promise<void> => {
    logger.info('Shutting down gracefully...');
    
    try {
        // Stop monitoring service
        pumpFunMonitor.stop();
        logger.info('Monitoring service stopped');

        // Close server
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            logger.info('Server closed');
        }

        // Close database connection
        await mongodb.mongoose.connection.close();
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
process.on('unhandledRejection', (err: Error) => {
    logger.error('Unhandled Promise Rejection:', err);
    shutdown();
});

// Start the server
startServer();

export default app; 