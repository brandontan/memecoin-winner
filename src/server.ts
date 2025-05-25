import app from './app';
import { config } from './config/config';

const PORT = config.server.port;

const startServer = async () => {
  try {
    // Connect to the database
    await app.connectToDatabase();
    
    // Start the server
    app.app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📡 API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Rejection:', err);
  // Close server & exit process
  process.exit(1);
});

// Start the application
startServer();
