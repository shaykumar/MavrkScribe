# Building MavrkScribe for Windows

## Prerequisites

### On Windows Machine:
1. Install Node.js (v16 or higher)
2. Install Windows Build Tools:
   ```powershell
   npm install --global --production windows-build-tools
   ```
3. Install Python 2.7 (required for some native modules)

### On macOS (Cross-compilation):
1. Install Wine (for building Windows installer on Mac):
   ```bash
   brew install --cask wine-stable
   ```

## Build Process

### Option 1: Build on Windows

1. Clone/Copy the MavrkScribe folder to Windows machine
2. Install dependencies:
   ```cmd
   cd MavrkScribe
   npm install
   ```

3. Create Windows installer:
   ```cmd
   npm run dist-win
   ```

### Option 2: Cross-compile from macOS

1. Install Wine and mono:
   ```bash
   brew install --cask wine-stable
   brew install mono
   ```

2. Build for Windows:
   ```bash
   cd ~/Desktop/MavrkScribe
   npm run dist-win
   ```

## Icon Requirements

Before building, you need to:
1. Convert `icon.png` to `icon.ico` format (256x256, 128x128, 64x64, 32x32, 16x16)
2. Use online converter: https://convertio.co/png-ico/ or https://icoconvert.com/

## Build Output

After successful build, you'll find in `dist/` folder:
- `MavrkScribe Setup 1.0.0.exe` - Windows installer
- `MavrkScribe-1.0.0-win.zip` - Portable version

## Configuration Files Needed

### 1. Create LICENSE.txt
```text
MIT License

Copyright (c) 2024 Mavrk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 2. Environment Variables
Create `.env.example` for distribution:
```env
# AWS Credentials for Transcribe Medical
AWS_REGION=ap-southeast-2
AWS_PROFILE=your-profile-here

# OpenAI API Key
OPENAI_API_KEY=your-key-here
```

## Signing (Optional but Recommended)

For production distribution without Windows SmartScreen warnings:

1. Purchase a code signing certificate from:
   - DigiCert
   - Sectigo
   - GlobalSign

2. Configure in package.json:
   ```json
   "win": {
     "certificateFile": "path/to/certificate.pfx",
     "certificatePassword": "your-password"
   }
   ```

## Testing

1. Test installer on Windows 10/11
2. Verify:
   - Installation process
   - Desktop shortcut creation
   - Start menu entry
   - Uninstallation
   - Microphone permissions
   - AWS Transcribe connectivity

## Distribution

### Option 1: Direct Download
- Host the `.exe` file on your website
- Provide download link to users

### Option 2: Microsoft Store
1. Create Microsoft Developer account
2. Convert to MSIX package:
   ```cmd
   npm install -g electron-windows-store
   electron-windows-store --input-directory dist/win-unpacked --output-directory dist/store --package-name MavrkScribe
   ```

### Option 3: Auto-Update
Add electron-updater for automatic updates:
```bash
npm install electron-updater
```

Configure in main.js:
```javascript
const { autoUpdater } = require('electron-updater');

app.on('ready', () => {
  autoUpdater.checkForUpdatesAndNotify();
});
```

## Common Issues & Solutions

### Issue: Node modules not building
**Solution**: Rebuild for Windows architecture
```cmd
npm rebuild
```

### Issue: Antivirus flags the app
**Solution**: Sign the application with a valid certificate

### Issue: Missing Visual C++ Redistributable
**Solution**: Include in installer or document requirement

### Issue: AWS credentials not working
**Solution**: Users need to configure AWS CLI or provide credentials in .env

## Security Considerations

1. **Never include actual API keys in distribution**
2. **Use environment variables or secure key storage**
3. **Sign the executable to prevent security warnings**
4. **Enable Windows Defender exemption during development**

## Final Checklist

- [ ] Icon file (icon.ico) created
- [ ] LICENSE.txt file present
- [ ] .env.example file included
- [ ] README with installation instructions
- [ ] Tested on Windows 10/11
- [ ] Code signing certificate (optional)
- [ ] Auto-updater configured (optional)