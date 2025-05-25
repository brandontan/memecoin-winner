const winston = require('winston');
const config = require('../config');

const { combine, timestamp, printf, colorize, json } = winston.format;

// Define log levels with colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Set level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Tell winston to use colors
winston.addColors(colors);

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    msg += ' ' + JSON.stringify(metadata, null, 2);
  }
  
  return msg;
});

// Create the logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json(),
  ),
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
      handleExceptions: true,
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  exitOnError: false, // Don't exit on handled exceptions
});

// Create a stream object with a 'write' function that will be used by morgan
logger.stream = {
  write: function (message) {
    // Remove newline at the end of the message
    logger.http(message.trim());
  },
};

// Handle uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', error);
  // Application specific logging, throwing an error, or other logic here
  process.exit(1); // Mandatory (as per the Node.js docs)
});

module.exports = logger;
