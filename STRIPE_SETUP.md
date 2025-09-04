# Stripe Payment Setup for MavrkScribe

## Quick Setup Guide

### 1. Create Stripe Account
1. Sign up at https://stripe.com
2. Complete business verification
3. Enable "Test mode" for initial setup

### 2. Create Payment Link (Easiest Method)
1. Go to https://dashboard.stripe.com/payment-links
2. Click "New payment link"
3. Configure:
   - Product name: "MavrkScribe Pro"
   - Price: $29.00/month (recurring)
   - Description: "Unlimited medical transcriptions and AI-powered clinical notes"
   - Add fields: Email (required)
4. Copy the payment link URL

### 3. Update subscription-manager.js
Replace the placeholder URL in `getCheckoutUrl()`:
```javascript
getCheckoutUrl() {
    // Replace with your actual Stripe Payment Link
    return 'https://buy.stripe.com/YOUR_PAYMENT_LINK_ID';
}
```

### 4. Set Up Webhook (For Auto-Activation)
1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://your-server.com/webhook/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`

### 5. Simple Webhook Server (Optional)
Create a simple Node.js server to handle Stripe webhooks:

```javascript
// webhook-server.js
const express = require('express');
const stripe = require('stripe')('sk_live_YOUR_SECRET_KEY');
const app = express();

app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = 'whsec_YOUR_WEBHOOK_SECRET';
    
    try {
        const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                // Generate license key
                const licenseKey = generateLicenseKey();
                // Email license key to customer
                await sendLicenseEmail(session.customer_email, licenseKey);
                break;
        }
        
        res.json({received: true});
    } catch (err) {
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
});

app.listen(3000);
```

## Alternative: Manual License Key Distribution

For simplicity, you can:
1. Receive payment notification from Stripe
2. Manually generate a license key using:
```javascript
// Generate license key
const crypto = require('crypto');
const key = `MAVRK-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
console.log(key); // MAVRK-A1B2C3-D4E5F6-789ABC
```
3. Email the key to the customer
4. Customer activates in app using "Enter License Key" button

## Testing
1. Use Stripe test mode
2. Test card: 4242 4242 4242 4242
3. Any future expiry date and CVC

## Going Live
1. Switch to Live mode in Stripe
2. Update payment link to live version
3. Update webhook endpoint if using
4. Test with real payment

## Pricing Strategy
- **Free**: 5 transcriptions/day
- **Pro**: $29/month (unlimited)
- **Clinic**: $99/month (5 seats) - future
- **Enterprise**: Custom pricing - future

## Support
- Stripe Dashboard: https://dashboard.stripe.com
- Stripe Docs: https://stripe.com/docs
- Payment Links: https://stripe.com/docs/payment-links