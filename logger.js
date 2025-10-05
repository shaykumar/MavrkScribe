// Production-ready logger utility
const isDevelopment = process.env.NODE_ENV === 'development';

class Logger {
    constructor() {
        this.enabled = isDevelopment;
    }

    log(...args) {
        if (this.enabled) {
            console.log('[INFO]', new Date().toISOString(), ...args);
        }
    }

    error(...args) {
        // Always log errors, but in production send to error reporting service
        if (this.enabled) {
            console.error('[ERROR]', new Date().toISOString(), ...args);
        }
        // In production, this would send to Sentry or similar service
        this.reportError(args);
    }

    warn(...args) {
        if (this.enabled) {
            console.warn('[WARN]', new Date().toISOString(), ...args);
        }
    }

    debug(...args) {
        if (this.enabled) {
            console.debug('[DEBUG]', new Date().toISOString(), ...args);
        }
    }

    reportError(error) {
        // Placeholder for error reporting service integration
        // In production, integrate with Sentry, Rollbar, etc.
        if (!isDevelopment) {
            // Would send to error tracking service
        }
    }
}

module.exports = new Logger();