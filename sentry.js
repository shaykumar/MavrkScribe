// Sentry error tracking and monitoring
const Sentry = require('@sentry/electron/main');
let app;
try {
    app = require('electron').app;
} catch (e) {
    // Handle case where electron is not available
    app = { getVersion: () => '1.0.0' };
}
const isDevelopment = process.env.NODE_ENV === 'development';

function initializeSentry() {
    if (isDevelopment) {
        // Sentry disabled in development mode
        return;
    }

    const dsn = process.env.SENTRY_DSN;

    // Skip Sentry initialization if no valid DSN provided
    if (!dsn || dsn === 'YOUR_SENTRY_DSN_HERE' || !dsn.startsWith('https://')) {
        return;
    }

    // Initialize Sentry with your DSN
    Sentry.init({
        dsn: dsn,

        // Performance Monitoring
        tracesSampleRate: 0.1, // Capture 10% of transactions

        // Release tracking
        release: app.getVersion(),

        // Environment
        environment: process.env.NODE_ENV || 'production',

        // Session tracking
        autoSessionTracking: true,

        // Integrations for main process
        integrations: [
            // Default integrations are automatically included
        ],

        // Before send hook to filter sensitive data
        beforeSend(event, hint) {
            // Filter out sensitive information
            if (event.request) {
                // Remove auth headers
                if (event.request.headers) {
                    delete event.request.headers['Authorization'];
                    delete event.request.headers['x-api-key'];
                }
                // Remove cookies
                delete event.request.cookies;
            }

            // Filter out local file paths in development
            if (event.exception) {
                const values = event.exception.values;
                if (values && values[0]) {
                    const stacktrace = values[0].stacktrace;
                    if (stacktrace && stacktrace.frames) {
                        stacktrace.frames = stacktrace.frames.map(frame => {
                            if (frame.filename) {
                                frame.filename = frame.filename.replace(/^.*\/MavrkScribe\//, 'app/');
                            }
                            return frame;
                        });
                    }
                }
            }

            // Don't send events in development
            if (isDevelopment) {
                return null;
            }

            return event;
        }
    });

    // Capture user feedback
    Sentry.setUser({
        id: require('crypto').randomBytes(16).toString('hex'),
        // Don't capture actual email for privacy
    });

    // Add context
    Sentry.setContext('app', {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        node_version: process.version,
    });
}

// Track specific events
function trackEvent(eventName, data = {}) {
    if (isDevelopment) return;

    Sentry.addBreadcrumb({
        message: eventName,
        level: 'info',
        data: data,
        timestamp: Date.now() / 1000,
    });
}

// Track performance
function trackPerformance(transactionName, operation, callback) {
    if (isDevelopment) {
        return callback();
    }

    const transaction = Sentry.startTransaction({
        op: operation,
        name: transactionName,
    });

    Sentry.getCurrentHub().configureScope(scope => scope.setSpan(transaction));

    try {
        const result = callback();
        transaction.setStatus('ok');
        return result;
    } catch (error) {
        transaction.setStatus('internal_error');
        throw error;
    } finally {
        transaction.finish();
    }
}

// Report custom errors
function reportError(error, context = {}) {
    if (isDevelopment) {
        console.error('Error reported:', error, context);
        return;
    }

    Sentry.captureException(error, {
        extra: context
    });
}

module.exports = {
    initializeSentry,
    trackEvent,
    trackPerformance,
    reportError
};