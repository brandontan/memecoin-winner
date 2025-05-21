// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

// Increase timeout for tests
jest.setTimeout(30000); 