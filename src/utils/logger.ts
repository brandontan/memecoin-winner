import winston from 'winston';

// Create a default logger instance
const loggerInstance = winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: 'logs/combined.log' 
        }),
    ],
});

// Export the logger instance as default
export default loggerInstance;

// Named export for the stream
const stream = {
    write: (message: string) => {
        loggerInstance.info(message.trim());
    },
};

export { stream }; 