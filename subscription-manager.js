// Subscription Manager for MavrkScribe
const { app } = require('electron');
const Store = require('electron-store');
const crypto = require('crypto');

class SubscriptionManager {
    constructor() {
        this.store = new Store({
            encryptionKey: 'mavrk-scribe-2024', // Simple encryption for local data
            schema: {
                subscription: {
                    type: 'object',
                    properties: {
                        tier: { type: 'string', enum: ['free', 'pro'], default: 'free' },
                        status: { type: 'string', enum: ['active', 'cancelled', 'expired'], default: 'active' },
                        customerId: { type: ['string', 'null'], default: null },
                        subscriptionId: { type: ['string', 'null'], default: null },
                        expiresAt: { type: ['number', 'null'], default: null }
                    },
                    default: {
                        tier: 'free',
                        status: 'active',
                        customerId: null,
                        subscriptionId: null,
                        expiresAt: null
                    }
                },
                dailyUsage: {
                    type: 'object',
                    properties: {
                        date: { type: 'string' },
                        count: { type: 'number', default: 0 }
                    },
                    default: {
                        date: new Date().toDateString(),
                        count: 0
                    }
                },
                stats: {
                    type: 'object',
                    properties: {
                        totalTranscriptions: { type: 'number', default: 0 },
                        totalNotes: { type: 'number', default: 0 },
                        firstUse: { type: 'string' }
                    },
                    default: {
                        totalTranscriptions: 0,
                        totalNotes: 0,
                        firstUse: new Date().toISOString()
                    }
                }
            }
        });

        // Initialize with defaults if not exists
        if (!this.store.has('subscription')) {
            this.store.set('subscription', {
                tier: 'free',
                status: 'active',
                customerId: null,
                subscriptionId: null,
                expiresAt: null
            });
        }

        // Check and reset daily usage if it's a new day
        this.checkDailyReset();
    }

    checkDailyReset() {
        const today = new Date().toDateString();
        const dailyUsage = this.store.get('dailyUsage', { date: today, count: 0 });
        
        if (dailyUsage.date !== today) {
            this.store.set('dailyUsage', {
                date: today,
                count: 0
            });
        }
    }

    // Check if user can transcribe
    async canTranscribe(email = null) {
        // If email provided, check with API first
        if (email) {
            const apiStatus = await this.checkSubscriptionAPI(email);
            if (apiStatus && apiStatus.subscription) {
                // Update local storage with API data
                this.store.set('subscription', {
                    tier: apiStatus.subscription.tier,
                    status: apiStatus.subscription.status,
                    customerId: apiStatus.subscription.customerId,
                    subscriptionId: apiStatus.subscription.subscriptionId,
                    expiresAt: apiStatus.subscription.expiresAt
                });
            }
        }
        
        const subscription = this.store.get('subscription');
        
        // Pro users have unlimited access
        if (subscription.tier === 'pro' && subscription.status === 'active') {
            // Check if subscription hasn't expired
            if (subscription.expiresAt && Date.now() > subscription.expiresAt) {
                this.store.set('subscription.status', 'expired');
                this.store.set('subscription.tier', 'free');
                return this.canTranscribe(); // Recheck with free tier
            }
            return { allowed: true, reason: 'Pro subscription active' };
        }

        // Free tier: check daily limit
        this.checkDailyReset();
        const dailyUsage = this.store.get('dailyUsage');
        
        if (dailyUsage.count >= 5) {
            return { 
                allowed: false, 
                reason: 'Daily limit reached (5 transcriptions). Upgrade to Pro for unlimited access.',
                remainingToday: 0
            };
        }

        return { 
            allowed: true, 
            reason: 'Free tier',
            remainingToday: 5 - dailyUsage.count
        };
    }
    
    // Check subscription status via API
    async checkSubscriptionAPI(email) {
        try {
            const response = await fetch('https://fth8em7xy0.execute-api.ap-southeast-2.amazonaws.com/prod/subscription/check', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: email.toLowerCase() })
            });
            
            if (response.ok) {
                const data = await response.json();
                return data;
            }
        } catch (error) {
            console.error('Error checking subscription API:', error);
        }
        return null;
    }

    // Increment usage counter
    incrementUsage() {
        this.checkDailyReset();
        const dailyUsage = this.store.get('dailyUsage');
        dailyUsage.count += 1;
        this.store.set('dailyUsage', dailyUsage);

        // Update stats
        const stats = this.store.get('stats', {
            totalTranscriptions: 0,
            totalNotes: 0,
            firstUse: new Date().toISOString()
        });
        stats.totalTranscriptions += 1;
        this.store.set('stats', stats);

        return dailyUsage.count;
    }

    // Get current subscription status
    async getSubscriptionStatus() {
        // Check if we have a stored email
        const storedEmail = this.store.get('userEmail');
        if (storedEmail) {
            // Check API for latest subscription status
            const apiStatus = await this.checkSubscriptionAPI(storedEmail);
            if (apiStatus && apiStatus.subscription) {
                // Update local storage with API data
                this.store.set('subscription', {
                    tier: apiStatus.subscription.tier,
                    status: apiStatus.subscription.status,
                    customerId: apiStatus.subscription.customerId,
                    subscriptionId: apiStatus.subscription.subscriptionId,
                    expiresAt: apiStatus.subscription.expiresAt
                });
            }
        }
        
        const subscription = this.store.get('subscription');
        const dailyUsage = this.store.get('dailyUsage', { date: new Date().toDateString(), count: 0 });
        const stats = this.store.get('stats', {
            totalTranscriptions: 0,
            totalNotes: 0,
            firstUse: new Date().toISOString()
        });

        return {
            ...subscription,
            dailyUsage: dailyUsage.count,
            remainingToday: subscription.tier === 'pro' ? 'Unlimited' : Math.max(0, 5 - dailyUsage.count),
            stats,
            email: storedEmail
        };
    }
    
    // Store user email
    setUserEmail(email) {
        this.store.set('userEmail', email.toLowerCase());
    }

    // Activate Pro subscription (via Stripe webhook or manual activation)
    activatePro(data) {
        this.store.set('subscription', {
            tier: 'pro',
            status: 'active',
            customerId: data.customerId || null,
            subscriptionId: data.subscriptionId || null,
            expiresAt: data.expiresAt || Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
        });

        return this.getSubscriptionStatus();
    }

    // Cancel subscription
    cancelSubscription() {
        const subscription = this.store.get('subscription');
        subscription.status = 'cancelled';
        subscription.tier = 'free';
        this.store.set('subscription', subscription);
        return this.getSubscriptionStatus();
    }

    // Get Stripe checkout URL
    getCheckoutUrl() {
        return 'https://buy.stripe.com/test_28EeVcfnZeXBeU62eIdwc00';
    }

    // Get customer portal URL
    getCustomerPortalUrl(customerId) {
        // Replace with your actual Stripe Customer Portal configuration
        return `https://billing.stripe.com/p/session/test_YOUR_PORTAL_SESSION`;
    }
}

module.exports = SubscriptionManager;