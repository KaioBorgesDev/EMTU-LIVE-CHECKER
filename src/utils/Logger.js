const fs = require('fs-extra');
const path = require('path');

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logFile = process.env.LOG_FILE || './logs/app.log';
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.maxFiles = 5;
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.currentLevel = this.levels[this.logLevel] || this.levels.info;
        
        this.initialize();
    }

    async initialize() {
        try {
            await fs.ensureDir(path.dirname(this.logFile));
            
            await this.rotateLogsIfNeeded();
        } catch (error) {
            console.error('Failed to initialize logger:', error);
        }
    }

    async rotateLogsIfNeeded() {
        try {
            if (await fs.pathExists(this.logFile)) {
                const stats = await fs.stat(this.logFile);
                
                if (stats.size > this.maxFileSize) {
                    await this.rotateLogs();
                }
            }
        } catch (error) {
            console.error('Failed to check log rotation:', error);
        }
    }

    async rotateLogs() {
        try {
            const logDir = path.dirname(this.logFile);
            const logName = path.basename(this.logFile, path.extname(this.logFile));
            const logExt = path.extname(this.logFile);
            
            // Move existing log files
            for (let i = this.maxFiles - 1; i >= 1; i--) {
                const oldFile = path.join(logDir, `${logName}.${i}${logExt}`);
                const newFile = path.join(logDir, `${logName}.${i + 1}${logExt}`);
                
                if (await fs.pathExists(oldFile)) {
                    if (i === this.maxFiles - 1) {
                        // Delete the oldest file
                        await fs.remove(oldFile);
                    } else {
                        await fs.move(oldFile, newFile);
                    }
                }
            }
            
            // Move current log file
            const firstBackup = path.join(logDir, `${logName}.1${logExt}`);
            await fs.move(this.logFile, firstBackup);
            
            console.log('Log files rotated successfully');
        } catch (error) {
            console.error('Failed to rotate log files:', error);
        }
    }

    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const pid = process.pid;
        const formattedMessage = args.length > 0 ? 
            `${message} ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}` : 
            message;
        
        return `[${timestamp}] [${pid}] [${level.toUpperCase()}] ${formattedMessage}`;
    }

    async writeToFile(message) {
        try {
            await this.rotateLogsIfNeeded();
            await fs.appendFile(this.logFile, message + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    shouldLog(level) {
        return this.levels[level] <= this.currentLevel;
    }

    async log(level, message, ...args) {
        if (!this.shouldLog(level)) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message, ...args);
        
        // Always write to file if logging is enabled for this level
        await this.writeToFile(formattedMessage);
        
        // Console output based on level
        switch (level) {
            case 'error':
                console.error(formattedMessage);
                break;
            case 'warn':
                console.warn(formattedMessage);
                break;
            case 'info':
                console.log(formattedMessage);
                break;
            case 'debug':
                if (process.env.NODE_ENV === 'development') {
                    console.log(formattedMessage);
                }
                break;
        }
    }

    error(message, ...args) {
        return this.log('error', message, ...args);
    }

    warn(message, ...args) {
        return this.log('warn', message, ...args);
    }

    info(message, ...args) {
        return this.log('info', message, ...args);
    }

    debug(message, ...args) {
        return this.log('debug', message, ...args);
    }

    // Utility methods for structured logging
    logApiRequest(method, url, status, duration) {
        this.info(`API Request: ${method} ${url} - ${status} (${duration}ms)`);
    }

    logApiError(method, url, error, duration) {
        this.error(`API Error: ${method} ${url} - ${error.message} (${duration}ms)`, error);
    }

    logUserAction(chatId, action, details = '') {
        this.info(`User Action: ${chatId} - ${action} ${details}`);
    }

    logSystemEvent(event, details = '') {
        this.info(`System Event: ${event} ${details}`);
    }

    logPerformance(operation, duration, details = '') {
        if (duration > 1000) {
            this.warn(`Performance: ${operation} took ${duration}ms ${details}`);
        } else {
            this.debug(`Performance: ${operation} took ${duration}ms ${details}`);
        }
    }

    // Create a child logger with context
    child(context) {
        return new ChildLogger(this, context);
    }

    // Get log statistics
    async getLogStatistics() {
        try {
            const stats = {
                currentLogSize: 0,
                totalLogFiles: 0,
                oldestLogDate: null,
                newestLogDate: null
            };

            if (await fs.pathExists(this.logFile)) {
                const currentStats = await fs.stat(this.logFile);
                stats.currentLogSize = currentStats.size;
                stats.newestLogDate = currentStats.mtime;
            }

            // Check for rotated log files
            const logDir = path.dirname(this.logFile);
            const logName = path.basename(this.logFile, path.extname(this.logFile));
            const logExt = path.extname(this.logFile);

            for (let i = 1; i <= this.maxFiles; i++) {
                const logFile = path.join(logDir, `${logName}.${i}${logExt}`);
                if (await fs.pathExists(logFile)) {
                    stats.totalLogFiles++;
                    const fileStats = await fs.stat(logFile);
                    
                    if (!stats.oldestLogDate || fileStats.mtime < stats.oldestLogDate) {
                        stats.oldestLogDate = fileStats.mtime;
                    }
                }
            }

            return stats;
        } catch (error) {
            this.error('Failed to get log statistics:', error);
            return {
                currentLogSize: 0,
                totalLogFiles: 0,
                oldestLogDate: null,
                newestLogDate: null
            };
        }
    }

    // Clear all log files
    async clearLogs() {
        try {
            const logDir = path.dirname(this.logFile);
            const logName = path.basename(this.logFile, path.extname(this.logFile));
            const logExt = path.extname(this.logFile);

            // Remove current log file
            if (await fs.pathExists(this.logFile)) {
                await fs.remove(this.logFile);
            }

            // Remove rotated log files
            for (let i = 1; i <= this.maxFiles; i++) {
                const logFile = path.join(logDir, `${logName}.${i}${logExt}`);
                if (await fs.pathExists(logFile)) {
                    await fs.remove(logFile);
                }
            }

            this.info('All log files cleared');
            return true;
        } catch (error) {
            this.error('Failed to clear log files:', error);
            return false;
        }
    }
}

class ChildLogger {
    constructor(parentLogger, context) {
        this.parent = parentLogger;
        this.context = context;
    }

    formatContextMessage(message) {
        const contextStr = typeof this.context === 'object' 
            ? JSON.stringify(this.context) 
            : this.context;
        return `[${contextStr}] ${message}`;
    }

    error(message, ...args) {
        return this.parent.error(this.formatContextMessage(message), ...args);
    }

    warn(message, ...args) {
        return this.parent.warn(this.formatContextMessage(message), ...args);
    }

    info(message, ...args) {
        return this.parent.info(this.formatContextMessage(message), ...args);
    }

    debug(message, ...args) {
        return this.parent.debug(this.formatContextMessage(message), ...args);
    }
}

module.exports = Logger;
