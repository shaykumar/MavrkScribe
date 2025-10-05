// Auto-updater configuration
const { autoUpdater } = require('electron-updater');
const { app, dialog, BrowserWindow } = require('electron');
const logger = require('./logger');

class AutoUpdater {
    constructor() {
        this.isUpdating = false;
        this.mainWindow = null;

        // Configure auto-updater
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = true;

        // Set update feed URL (GitHub releases or your server)
        if (process.env.UPDATE_URL) {
            autoUpdater.setFeedURL({
                provider: 'generic',
                url: process.env.UPDATE_URL
            });
        } else {
            // Default to GitHub releases
            autoUpdater.setFeedURL({
                provider: 'github',
                owner: 'mavrk',
                repo: 'mavrkscribe',
                private: false
            });
        }

        this.setupEventHandlers();
    }

    setMainWindow(window) {
        this.mainWindow = window;
    }

    setupEventHandlers() {
        // Checking for updates
        autoUpdater.on('checking-for-update', () => {
            logger.log('Checking for updates...');
            this.sendStatusToWindow('checking-for-update');
        });

        // Update available
        autoUpdater.on('update-available', (info) => {
            logger.log('Update available:', info.version);
            this.sendStatusToWindow('update-available', info);

            const dialogOpts = {
                type: 'info',
                buttons: ['Download', 'Later'],
                title: 'Application Update',
                message: `A new version (${info.version}) is available`,
                detail: 'A new version has been found. Would you like to download it now?'
            };

            dialog.showMessageBox(dialogOpts).then((returnValue) => {
                if (returnValue.response === 0) {
                    autoUpdater.downloadUpdate();
                }
            });
        });

        // No updates available
        autoUpdater.on('update-not-available', (info) => {
            logger.log('Update not available');
            this.sendStatusToWindow('update-not-available', info);
        });

        // Download progress
        autoUpdater.on('download-progress', (progressObj) => {
            let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
            log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
            log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';

            logger.log(log_message);
            this.sendStatusToWindow('download-progress', progressObj);
        });

        // Update downloaded
        autoUpdater.on('update-downloaded', (info) => {
            logger.log('Update downloaded');
            this.sendStatusToWindow('update-downloaded', info);

            const dialogOpts = {
                type: 'info',
                buttons: ['Restart', 'Later'],
                title: 'Application Update',
                message: 'Update Downloaded',
                detail: 'A new version has been downloaded. Restart the application to apply the updates.'
            };

            dialog.showMessageBox(dialogOpts).then((returnValue) => {
                if (returnValue.response === 0) {
                    autoUpdater.quitAndInstall();
                }
            });
        });

        // Error handling
        autoUpdater.on('error', (error) => {
            logger.error('Update error:', error);
            this.sendStatusToWindow('error', error.message);

            // Don't show error dialog in development
            if (process.env.NODE_ENV === 'development') {
                return;
            }

            dialog.showErrorBox('Update Error',
                'An error occurred while checking for updates. Please try again later.');
        });
    }

    sendStatusToWindow(status, data = null) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('update-status', { status, data });
        }
    }

    checkForUpdates() {
        if (this.isUpdating) {
            logger.log('Update check already in progress');
            return;
        }

        // Don't check in development
        if (process.env.NODE_ENV === 'development') {
            logger.log('Skipping update check in development');
            return;
        }

        this.isUpdating = true;

        autoUpdater.checkForUpdatesAndNotify()
            .catch(error => {
                logger.error('Failed to check for updates:', error);
            })
            .finally(() => {
                this.isUpdating = false;
            });
    }

    // Check for updates periodically
    startUpdateCheck(intervalHours = 4) {
        // Check on startup
        setTimeout(() => {
            this.checkForUpdates();
        }, 5000); // Wait 5 seconds after app start

        // Check periodically
        setInterval(() => {
            this.checkForUpdates();
        }, intervalHours * 60 * 60 * 1000);
    }
}

module.exports = AutoUpdater;