# Stripe Webhook Configuration

## ✅ Your Webhook is Deployed!

### Webhook Endpoint URL:
```
https://fth8em7xy0.execute-api.ap-southeast-2.amazonaws.com/prod/stripe/webhook
```

### Subscription Check API:
```
https://fth8em7xy0.execute-api.ap-southeast-2.amazonaws.com/prod/subscription/check
```

## Setup Instructions

### 1. Add Webhook to Stripe Dashboard

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"
3. Enter endpoint URL: `https://fth8em7xy0.execute-api.ap-southeast-2.amazonaws.com/prod/stripe/webhook`
4. Select events to listen for:
   - `checkout.session.completed` ✅ (Most important)
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
5. Click "Add endpoint"
6. Copy the "Signing secret" (starts with `whsec_`)

### 2. Update Lambda Environment Variables

1. Go to AWS Lambda Console: https://ap-southeast-2.console.aws.amazon.com/lambda
2. Find function: `MavrkDesktopCdkStack-StripeWebhookFunction`
3. Go to Configuration → Environment variables
4. Update:
   - `STRIPE_SECRET_KEY`: Your Stripe secret key (sk_test_...)
   - `STRIPE_WEBHOOK_SECRET`: The webhook signing secret from step 1.6

### 3. Test the Webhook

In Stripe Dashboard:
1. Go to your webhook endpoint
2. Click "Send test webhook"
3. Select `checkout.session.completed`
4. Send test webhook
5. Check CloudWatch logs for the Lambda function

## How It Works

1. **User pays via Stripe** → Stripe sends webhook to your API
2. **Lambda processes payment** → Stores subscription in DynamoDB
3. **MavrkScribe checks status** → Calls subscription check API with email
4. **User gets Pro access** → Based on subscription status in DynamoDB

## Database Structure

The subscription is stored in DynamoDB table `mavrk-subscriptions` with:
- **email** (primary key): Customer email
- **tier**: 'free' or 'pro'
- **status**: 'active', 'cancelled', 'expired'
- **expiresAt**: Timestamp when subscription expires
- **customerId**: Stripe customer ID
- **subscriptionId**: Stripe subscription ID

## Testing Payment Flow

1. Use test card: `4242 4242 4242 4242`
2. Any future expiry, any CVC
3. Use a real email address
4. After payment, check DynamoDB table for the subscription

## Monitor in CloudWatch

View logs at:
```
https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-2#logsV2:log-groups/log-group/aws$252Flambda$252FMavrkDesktopCdkStack-StripeWebhookFunction
```

## Next Steps

1. ✅ Add webhook URL to Stripe Dashboard
2. ✅ Update Lambda environment variables
3. ✅ Test with a payment
4. ✅ Verify subscription in DynamoDB
5. ✅ Update MavrkScribe to check subscription status