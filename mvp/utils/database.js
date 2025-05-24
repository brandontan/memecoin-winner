const mongoose = require('mongoose');
const logger = require('./logger');
const config = require('../config');

class Database {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    try {
      if (this.isConnected) {
        logger.warn('Database already connected');
        return;
      }

      await mongoose.connect(config.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });

      this.isConnected = true;
      logger.info('Connected to MongoDB');

      // Handle connection events
      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        this.isConnected = false;
      });

    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (!this.isConnected) return;

      await mongoose.connection.close();
      this.isConnected = false;
      logger.info('Disconnected from MongoDB');
    } catch (error) {
      logger.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  async dropDatabase() {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      await mongoose.connection.dropDatabase();
      logger.info('Database dropped');
    } catch (error) {
      logger.error('Error dropping database:', error);
      throw error;
    }
  }
}

module.exports = new Database();