// Simple console logger implementation
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const logger = {
  error: (message: string, ...meta: any[]) => console.error(`[ERROR] ${message}`, ...meta),
  warn: (message: string, ...meta: any[]) => console.warn(`[WARN]  ${message}`, ...meta),
  info: (message: string, ...meta: any[]) => console.log(`[INFO]  ${message}`, ...meta),
  debug: (message: string, ...meta: any[]) => 
    process.env.NODE_ENV === 'development' && console.debug(`[DEBUG] ${message}`, ...meta),
};

// For compatibility with existing code
export const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};

export { logger as default, logger as loggerInstance };