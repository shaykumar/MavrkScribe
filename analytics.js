// Analytics and telemetry service
const crypto = require('crypto');
const https = require('https');
let app;
try {
    app = require('electron').app;
} catch (e) {
    // If electron is not available, we're probably in a test environment
    app = { getVersion: () => '1.0.0', isReady: () => false };
}

class Analytics {
    constructor() {
        this.enabled = process.env.NODE_ENV === 'production';
        this.userId = this.generateUserId();
        this.sessionId = this.generateSessionId();
        this.queue = [];
        this.flushInterval = null;

        // Google Analytics Measurement Protocol (GA4)
        this.measurementId = process.env.GA_MEASUREMENT_ID;
        this.apiSecret = process.env.GA_API_SECRET;

        // Only enable if we have valid credentials
        if (this.enabled && this.apiSecret && this.measurementId &&
            this.measurementId !== 'G-XXXXXXXXXX' && this.apiSecret !== '') {
            this.startFlushInterval();
        } else {
            this.enabled = false;
        }
    }

    generateUserId() {
        // Generate anonymous user ID
        const machineId = require('os').hostname() + require('os').platform();
        return crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 16);
    }

    generateSessionId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    // Track events
    track(eventName, parameters = {}) {
        if (!this.enabled) return;

        const event = {
            name: eventName,
            params: {
                ...parameters,
                app_version: app.getVersion(),
                platform: process.platform,
                session_id: this.sessionId,
                engagement_time_msec: 1,
                timestamp_micros: Date.now() * 1000
            }
        };

        this.queue.push(event);

        // Flush if queue is getting large
        if (this.queue.length >= 10) {
            this.flush();
        }
    }

    // Track screen views
    trackScreenView(screenName) {
        this.track('screen_view', {
            screen_name: screenName
        });
    }

    // Track user actions
    trackAction(action, category = 'user_interaction', label = '', value = null) {
        const params = {
            action_category: category,
            action_label: label
        };

        if (value !== null) {
            params.value = value;
        }

        this.track(action, params);
    }

    // Track timing
    trackTiming(category, variable, time) {
        this.track('timing_complete', {
            timing_category: category,
            timing_variable: variable,
            timing_value: time
        });
    }

    // Track errors (non-fatal)
    trackError(description, fatal = false) {
        this.track('exception', {
            description: description.substring(0, 150), // Limit length
            fatal: fatal
        });
    }

    // Track feature usage
    trackFeatureUsage(feature) {
        this.track('feature_usage', {
            feature_name: feature,
            used_at: new Date().toISOString()
        });
    }

    // Flush events to analytics service
    async flush() {
        if (this.queue.length === 0 || !this.apiSecret) return;

        const events = [...this.queue];
        this.queue = [];

        const payload = {
            client_id: this.userId,
            events: events
        };

        try {
            const data = JSON.stringify(payload);

            const options = {
                hostname: 'www.google-analytics.com',
                port: 443,
                path: `/mp/collect?measurement_id=${this.measurementId}&api_secret=${this.apiSecret}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(options, (res) => {
                // Handle response silently
                res.on('data', () => {});
            });

            req.on('error', (error) => {
                // Fail silently, re-queue events
                this.queue.unshift(...events);
            });

            req.write(data);
            req.end();
        } catch (error) {
            // Re-queue events on error
            this.queue.unshift(...events);
        }
    }

    // Start periodic flush
    startFlushInterval() {
        this.flushInterval = setInterval(() => {
            this.flush();
        }, 30000); // Flush every 30 seconds
    }

    // Stop analytics
    stop() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        this.flush(); // Final flush
    }

    // Privacy-compliant metrics
    getMetrics() {
        return {
            session_duration: Date.now() - parseInt(this.sessionId.split('.')[0], 36),
            events_tracked: this.queue.length,
            platform: process.platform,
            app_version: app.getVersion()
        };
    }
}

// Singleton instance
let analyticsInstance = null;

function getAnalytics() {
    if (!analyticsInstance) {
        analyticsInstance = new Analytics();
    }
    return analyticsInstance;
}

module.exports = {
    getAnalytics,
    Analytics
};