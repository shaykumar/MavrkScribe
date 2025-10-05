# MavrkScribe Production Deployment Guide

## Prerequisites

1. **Sentry Account**: Sign up at https://sentry.io
2. **Google Analytics 4**: Create a property at https://analytics.google.com
3. **GitHub Repository**: For auto-updates via GitHub releases
4. **Apple Developer Certificate**: For macOS code signing
5. **Stripe Account**: Production API keys

## Configuration Steps

### 1. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Update with your production values:
- `OPENAI_API_KEY`: Your OpenAI API key
- `SENTRY_DSN`: From Sentry project settings
- `GA_MEASUREMENT_ID`: From Google Analytics
- `GA_API_SECRET`: From GA Measurement Protocol
- `UPDATE_URL`: Your update server or leave blank for GitHub

### 2. Sentry Setup

1. Create a new project in Sentry
2. Select "Electron" as platform
3. Copy the DSN to your `.env` file
4. Configure alerts and performance monitoring

### 3. Google Analytics Setup

1. Create a GA4 property
2. Go to Admin > Data Streams > Web
3. Get Measurement ID (G-XXXXXXXXXX)
4. Create API Secret: Admin > Data Streams > Measurement Protocol API secrets

### 4. Auto-Updater Setup

#### Using GitHub Releases:
1. Create a GitHub repository
2. Update `package.json` with your repo details
3. Create a GitHub personal access token
4. Set `GH_TOKEN` environment variable

#### Using Custom Server:
1. Set `UPDATE_URL` in `.env`
2. Host `latest.yml` and app files
3. Ensure HTTPS is configured

### 5. Code Signing

#### macOS:
```bash
# Export certificate from Keychain
security find-identity -v -p codesigning

# Set environment variables
export CSC_LINK=path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password
```

#### Windows:
```bash
# Use signtool or electron-builder's built-in signing
export CSC_LINK=path/to/certificate.pfx
export CSC_KEY_PASSWORD=your_password
```

### 6. Build for Production

```bash
# Set environment
export NODE_ENV=production

# Clean previous builds
rm -rf dist/

# Build for all platforms
npm run dist-all

# Or platform-specific
npm run dist       # macOS
npm run dist-win   # Windows
```

### 7. Testing Production Build

1. **Test auto-updater**: Deploy a test update
2. **Verify Sentry**: Check error reporting works
3. **Check analytics**: Verify events in GA dashboard
4. **Test payments**: Use Stripe test mode first

### 8. Deployment Checklist

- [ ] All console.logs removed
- [ ] Environment variables configured
- [ ] Code signing certificates ready
- [ ] Sentry DSN configured
- [ ] Analytics tracking verified
- [ ] Auto-updater tested
- [ ] Stripe production keys set
- [ ] AWS backend deployed
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] HTTPS enforced
- [ ] Error handling tested

### 9. Distribution

#### macOS App Store:
1. Archive with Xcode
2. Upload to App Store Connect
3. Submit for review

#### Direct Distribution:
1. Notarize the app (macOS)
2. Upload to your server
3. Update website download links

#### GitHub Releases:
1. Create a new release
2. Upload built artifacts
3. Auto-updater will detect automatically

### 10. Monitoring

Set up monitoring dashboards:

1. **Sentry**: Error rates, performance
2. **Google Analytics**: User engagement, feature usage
3. **AWS CloudWatch**: Lambda performance, API usage
4. **Stripe Dashboard**: Payment metrics

### Security Notes

- Never commit `.env` file
- Rotate API keys regularly
- Use environment-specific keys
- Enable 2FA on all services
- Regular security audits
- Keep dependencies updated

### Troubleshooting

**Auto-updater not working:**
- Check certificate signing
- Verify update server URL
- Check GitHub token permissions

**Sentry not reporting:**
- Verify DSN is correct
- Check network connectivity
- Ensure NODE_ENV=production

**Analytics not tracking:**
- Verify Measurement ID
- Check API secret
- Test with GA DebugView

## Support

For issues or questions:
- GitHub Issues: https://github.com/mavrk/mavrkscribe/issues
- Documentation: https://mavrk.com/docs/scribe