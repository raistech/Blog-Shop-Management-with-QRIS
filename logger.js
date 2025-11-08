/**
 * Winston Logger Configuration
 * Replaces console.log with structured logging
 */

const winston = require('winston');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: logFormat,
    defaultMeta: { service: 'rsastore' },
    transports: [
        // Error logs - separate file
        new winston.transports.File({ 
            filename: path.join(__dirname, 'logs', 'error.log'), 
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 5
        }),
        
        // Combined logs - all levels
        new winston.transports.File({ 
            filename: path.join(__dirname, 'logs', 'combined.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 10
        })
    ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat
    }));
} else {
    // In production, only log warnings and errors to console
    logger.add(new winston.transports.Console({
        format: consoleFormat,
        level: 'warn'
    }));
}

// Create a stream object for Morgan HTTP logging
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

// Helper methods for common log patterns
logger.logRequest = (req, meta = {}) => {
    logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        ...meta
    });
};

logger.logError = (error, req = null, meta = {}) => {
    const errorLog = {
        message: error.message,
        stack: error.stack,
        ...meta
    };
    
    if (req) {
        errorLog.request = {
            method: req.method,
            url: req.url,
            ip: req.ip
        };
    }
    
    logger.error('Error occurred', errorLog);
};

logger.logAuth = (action, userId, success, meta = {}) => {
    logger.info('Authentication', {
        action,
        userId,
        success,
        ...meta
    });
};

logger.logDatabase = (action, table, meta = {}) => {
    logger.debug('Database operation', {
        action,
        table,
        ...meta
    });
};

logger.logPayment = (action, invoiceNumber, amount, status, meta = {}) => {
    logger.info('Payment', {
        action,
        invoiceNumber,
        amount,
        status,
        ...meta
    });
};

module.exports = logger;
