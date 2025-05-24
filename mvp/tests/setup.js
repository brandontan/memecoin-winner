// Jest setup file for MVP tests
const logger = require('../utils/logger');

// Suppress console output during tests unless there's an error
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Only show errors during tests
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  
  // Keep error logging
  logger.level = 'error';
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.info = originalConsoleInfo;
  console.warn = originalConsoleWarn;
});

// Global test timeout
jest.setTimeout(30000);

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection in test:', error);
});