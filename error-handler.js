// Centralized error handling for production
const { dialog, app } = require('electron');
const logger = require('./logger');

class ErrorHandler {
    constructor() {
        this.isAppReady = false;
        this.pendingErrors = [];

        // Set up app ready listener
        if (app.isReady()) {
            this.isAppReady = true;
        } else {
            app.on('ready', () => {
                this.isAppReady = true;
                // Show any pending errors
                this.pendingErrors.forEach(({title, message, fatal}) => {
                    this.showErrorDialog(title, message, fatal);
                });
                this.pendingErrors = [];
            });
        }

        this.setupHandlers();
    }

    setupHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            if (!this.isAppReady) {
                console.error('Uncaught Exception:', error);
                this.pendingErrors.push({
                    title: 'An unexpected error occurred',
                    message: error.message,
                    fatal: false
                });
            } else {
                this.showErrorDialog('An unexpected error occurred', error.message);
            }
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            if (!this.isAppReady) {
                console.error('Unhandled Rejection:', reason);
                this.pendingErrors.push({
                    title: 'An unexpected error occurred',
                    message: reason?.message || String(reason),
                    fatal: false
                });
            } else {
                this.showErrorDialog('An unexpected error occurred', reason?.message || reason);
            }
        });
    }

    showErrorDialog(title, message, fatal = false) {
        if (!this.isAppReady) {
            // Queue the error to show later
            this.pendingErrors.push({title, message, fatal});
            return;
        }

        const options = {
            type: 'error',
            buttons: ['OK'],
            title: title,
            message: title,
            detail: message
        };

        dialog.showMessageBoxSync(null, options);

        if (fatal) {
            app.quit();
        }
    }

    // Wrap async functions with error handling
    wrapAsync(fn) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                logger.error('Async error:', error);
                throw error;
            }
        };
    }

    // Handle API errors gracefully
    handleAPIError(error, userMessage = 'An error occurred while processing your request') {
        logger.error('API Error:', error);

        let detail = userMessage;

        if (error.response?.status === 429) {
            detail = 'Rate limit exceeded. Please try again later.';
        } else if (error.response?.status === 401) {
            detail = 'Authentication failed. Please check your API configuration.';
        } else if (error.response?.status >= 500) {
            detail = 'Server error. Please try again later.';
        } else if (!navigator.onLine) {
            detail = 'No internet connection. Please check your network.';
        }

        return {
            success: false,
            error: detail,
            originalError: error.message
        };
    }
}

module.exports = new ErrorHandler();