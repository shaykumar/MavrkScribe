const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const { AWS_CONFIG, getApiUrl } = require('./aws-config.js');
require('dotenv').config();

// Initialize error handling
const errorHandler = require('./error-handler');
const logger = require('./logger');

// Initialize Sentry crash reporting
const { initializeSentry, trackEvent, reportError } = require('./sentry');
initializeSentry();

// Initialize auto-updater
const AutoUpdater = require('./auto-updater');
const autoUpdater = new AutoUpdater();

// Initialize analytics
const { getAnalytics } = require('./analytics');
const analytics = getAnalytics();

// Environment loading check - removed console logs for production

// Import AWS Transcribe Medical
let AWSTranscribeMedical;
try {
    AWSTranscribeMedical = require('./aws-transcribe-medical');
} catch (error) {
    // Failed to load AWS Transcribe Medical - handle silently in production
}

// Import Subscription Manager
const SubscriptionManager = require('./subscription-manager');
const subscriptionManager = new SubscriptionManager();

// Enable hot reload in development
if (process.env.NODE_ENV !== 'production') {
    try {
        require('electron-reload')(__dirname, {
            electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
            hardResetMethod: 'exit'
        });
    } catch (_) {
        // Error loading electron-reload - expected in production
    }
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        },
        icon: path.join(__dirname, 'icon.png'),
        title: 'MavrkScribe',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 20, y: 18 }
    });

    mainWindow.loadFile('index.html');

    // Set up auto-updater with main window
    autoUpdater.setMainWindow(mainWindow);
    autoUpdater.startUpdateCheck(4); // Check every 4 hours

    // Track app launch
    analytics.track('app_launched', {
        version: app.getVersion(),
        platform: process.platform
    });
    trackEvent('App Launched');

    // Create application menu
    const template = [
        {
            label: 'MavrkScribe',
            submenu: [
                { label: 'About MavrkScribe', role: 'about' },
                { type: 'separator' },
                { label: 'Preferences', accelerator: 'Cmd+,', click: () => { /* Add preferences */ } },
                { type: 'separator' },
                { label: 'Quit', accelerator: 'Cmd+Q', click: () => app.quit() }
            ]
        },
        {
            label: 'File',
            submenu: [
                { label: 'New Consultation', accelerator: 'Cmd+N', click: () => mainWindow.webContents.executeJavaScript('startNewConsultation(); clearCurrentSession()') },
                { label: 'Save to History', accelerator: 'Cmd+S', click: () => mainWindow.webContents.executeJavaScript('saveToHistory()') },
                { type: 'separator' },
                { label: 'Print', accelerator: 'Cmd+P', click: () => mainWindow.webContents.executeJavaScript('printNote()') }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Undo', accelerator: 'Cmd+Z', role: 'undo' },
                { label: 'Redo', accelerator: 'Shift+Cmd+Z', role: 'redo' },
                { type: 'separator' },
                { label: 'Cut', accelerator: 'Cmd+X', role: 'cut' },
                { label: 'Copy', accelerator: 'Cmd+C', role: 'copy' },
                { label: 'Paste', accelerator: 'Cmd+V', role: 'paste' },
                { label: 'Select All', accelerator: 'Cmd+A', role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { label: 'Reload', accelerator: 'Cmd+R', role: 'reload' },
                { label: 'Toggle Developer Tools', accelerator: 'Alt+Cmd+I', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: 'Actual Size', accelerator: 'Cmd+0', role: 'resetZoom' },
                { label: 'Zoom In', accelerator: 'Cmd+Plus', role: 'zoomIn' },
                { label: 'Zoom Out', accelerator: 'Cmd+-', role: 'zoomOut' },
                { type: 'separator' },
                { label: 'Toggle Fullscreen', accelerator: 'Ctrl+Cmd+F', role: 'togglefullscreen' }
            ]
        },
        {
            label: 'History',
            submenu: [
                { label: 'View History', accelerator: 'Cmd+H', click: () => mainWindow.webContents.executeJavaScript('showHistory()') },
                { label: 'Clear History', click: () => mainWindow.webContents.executeJavaScript('clearHistory()') }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { label: 'Minimize', accelerator: 'Cmd+M', role: 'minimize' },
                { label: 'Close', accelerator: 'Cmd+W', role: 'close' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                { label: 'Documentation', click: () => shell.openExternal('https://mavrk.com/docs/scribe') },
                { label: 'Report Issue', click: () => shell.openExternal('https://github.com/mavrk/scribe/issues') },
                { type: 'separator' },
                { label: 'Privacy Policy', click: () => shell.openExternal('https://mavrk.com/privacy') },
                { label: 'Terms of Service', click: () => shell.openExternal('https://mavrk.com/terms') }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
});

// Enable microphone permissions
app.on('ready', () => {
    if (process.platform === 'darwin') {
        const { systemPreferences } = require('electron');
        systemPreferences.askForMediaAccess('microphone').then(granted => {
            if (!granted) {
                // Microphone access denied - handle via UI feedback
            }
        });
    }
});

// IPC Handlers for AWS Transcribe Medical
let transcribeMedical = null;

ipcMain.handle('start-medical-transcription', async (event, options) => {
    try {
        // Check subscription limits
        const canTranscribe = await subscriptionManager.canTranscribe();
        if (!canTranscribe.allowed) {
            return { 
                success: false, 
                error: canTranscribe.reason,
                needsUpgrade: true
            };
        }

        if (!AWSTranscribeMedical) {
            return { success: false, error: 'AWS Transcribe Medical not available. Please configure AWS credentials.' };
        }
        
        if (!transcribeMedical) {
            transcribeMedical = new AWSTranscribeMedical();
        }
        
        // Increment usage counter
        subscriptionManager.incrementUsage();

        // Send updated subscription status to the renderer
        const updatedStatus = await subscriptionManager.getSubscriptionStatus();
        if (mainWindow) {
            mainWindow.webContents.send('subscription-status-updated', updatedStatus);
        }

        // Track transcription start
        analytics.trackAction('transcription_started', 'medical', options.specialty || 'general');
        trackEvent('Transcription Started');

        const transcriptionId = Date.now().toString();
        
        // Start transcription
        transcribeMedical.startTranscription({
            ...options,
            onTranscript: (data) => {
                // Transcript received
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('transcription-update', {
                        id: transcriptionId,
                        ...data
                    });
                }
            },
            onError: (error) => {
                // Transcription error
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('transcription-error', {
                        id: transcriptionId,
                        error: error.message
                    });
                }
            }
        }).catch(error => {
            // Failed to start transcription
        });
        
        return { success: true, id: transcriptionId };
    } catch (error) {
        // Error in medical transcription
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-medical-transcription', async () => {
    try {
        if (transcribeMedical) {
            await transcribeMedical.stopTranscription();
        }
        return { success: true };
    } catch (error) {
        // Error stopping transcription
        return { success: false, error: error.message };
    }
});

ipcMain.handle('send-audio-chunk', async (event, audioData) => {
    try {
        if (transcribeMedical && transcribeMedical.isTranscribing) {
            transcribeMedical.sendAudioChunk(audioData);
        }
        return { success: true };
    } catch (error) {
        // Error sending audio
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-medical-specialties', async () => {
    return {
        success: true,
        specialties: ['PRIMARYCARE', 'CARDIOLOGY', 'NEUROLOGY', 'ONCOLOGY', 'RADIOLOGY', 'UROLOGY']
    };
});

// OpenAI handler (simplified for MavrkScribe)
ipcMain.handle('chat-with-llm', async (event, message) => {
    try {
        // ChatWithLLM called

        // Check if AWS backend is configured
        if (AWS_CONFIG.API_ENDPOINT && AWS_CONFIG.API_ENDPOINT !== 'YOUR_API_GATEWAY_ENDPOINT') {
            // Using AWS backend

            return new Promise((resolve, reject) => {
                // Extract template from message if it's in the prompt
                let template = 'general';
                let actualPrompt = message;

                // Check if message contains template info (e.g., for specific templates)
                if (message.includes('SOAP note')) {
                    template = 'soap';
                } else if (message.includes('meeting notes')) {
                    template = 'meeting';
                } else if (message.includes('lecture notes')) {
                    template = 'lecture';
                } else if (message.includes('personal notes')) {
                    template = 'personal';
                }

                const data = JSON.stringify({
                    prompt: actualPrompt,
                    template: template
                });

                const url = new URL(getApiUrl(AWS_CONFIG.NOTE_GENERATION_ENDPOINT));

                const options = {
                    hostname: url.hostname,
                    port: 443,
                    path: url.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(data)
                    }
                };

                const req = https.request(options, (res) => {
                    let responseData = '';

                    res.on('data', (chunk) => {
                        responseData += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const response = JSON.parse(responseData);
                            // AWS Lambda response received
                            resolve(response);
                        } catch (error) {
                            // Error parsing AWS response
                            reject({ success: false, error: error.message });
                        }
                    });
                });

                req.on('error', (error) => {
                    // AWS request error
                    reject({ success: false, error: error.message });
                });

                req.write(data);
                req.end();
            });
        } else {
            // Fallback to direct OpenAI API if AWS backend is not configured
            // Using direct OpenAI API
            const apiKey = process.env.OPENAI_API_KEY;

            if (!apiKey) {
                // No OpenAI API key found
                return { success: false, error: 'OpenAI API key not configured' };
            }

            // Initializing OpenAI
            const OpenAI = require('openai');
            const openai = new OpenAI({
                apiKey: apiKey
            });

            // Making OpenAI API call
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: message }],
                temperature: 0.7,
                max_tokens: 2000
            });

            // OpenAI response received
            return {
                success: true,
                result: completion.choices[0].message.content
            };
        }
    } catch (error) {
        // API error occurred
        return { success: false, error: error.message };
    }
});

ipcMain.handle('has-openai-key', async () => {
    return !!process.env.OPENAI_API_KEY;
});

// Subscription Management Handlers
ipcMain.handle('get-subscription-status', async () => {
    return await subscriptionManager.getSubscriptionStatus();
});

ipcMain.handle('get-checkout-url', async () => {
    return subscriptionManager.getCheckoutUrl();
});

ipcMain.handle('cancel-subscription', async () => {
    return subscriptionManager.cancelSubscription();
});

ipcMain.handle('set-user-email', async (event, email) => {
    subscriptionManager.setUserEmail(email);
    return { success: true };
});