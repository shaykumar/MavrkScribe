// Application configuration
const isDevelopment = process.env.NODE_ENV === 'development';

const config = {
    // Environment
    isDevelopment,
    isProduction: !isDevelopment,

    // API Configuration
    api: {
        maxRetries: 3,
        timeout: 30000, // 30 seconds
        rateLimitDelay: 1000, // 1 second between requests
    },

    // Subscription limits
    subscription: {
        freeTier: {
            dailyLimit: 5,
            maxTranscriptLength: 10000, // characters
            maxNoteLength: 5000,
        },
        pro: {
            dailyLimit: -1, // unlimited
            maxTranscriptLength: -1,
            maxNoteLength: -1,
        }
    },

    // Security
    security: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedFileTypes: ['.txt', '.pdf', '.docx'],
        sessionTimeout: 30 * 60 * 1000, // 30 minutes
    },

    // Storage
    storage: {
        maxHistoryItems: 100,
        autoSaveInterval: 60000, // 1 minute
    },

    // UI
    ui: {
        toastDuration: 3000,
        animationSpeed: 200,
    },

    // Feature flags
    features: {
        enableCrashReporting: !isDevelopment,
        enableAnalytics: !isDevelopment,
        enableAutoUpdate: !isDevelopment,
        debugMode: isDevelopment,
    },

    // Error reporting (would be Sentry in production)
    errorReporting: {
        dsn: process.env.SENTRY_DSN || '',
        environment: isDevelopment ? 'development' : 'production',
    }
};

module.exports = config;