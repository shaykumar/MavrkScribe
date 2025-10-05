#!/bin/bash

# Production Build Script for MavrkScribe
set -e

echo "🚀 Building MavrkScribe for production..."

# Set environment to production
export NODE_ENV=production

# Clean previous builds
echo "📧 Cleaning previous builds..."
rm -rf dist/

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production=false

# Run tests if they exist
# echo "🧪 Running tests..."
# npm test

# Build the application
echo "🔨 Building application..."
npm run dist

echo "✅ Production build complete!"
echo "📦 Distribution files available in ./dist/"

# List built files
ls -la dist/

echo "⚠️  Remember to:"
echo "1. Replace Stripe production URL in subscription-manager.js"
echo "2. Configure production API keys in .env"
echo "3. Sign the app with developer certificate"
echo "4. Test thoroughly before distribution"