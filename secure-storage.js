// Secure storage wrapper for sensitive data
const crypto = require('crypto');

class SecureStorage {
    constructor() {
        // Generate encryption key based on machine ID
        const os = require('os');
        const machineId = os.hostname() + os.platform() + os.arch();
        this.key = crypto.createHash('sha256').update(machineId).digest();
        this.algorithm = 'aes-256-gcm';
    }

    // Encrypt data before storing
    encrypt(text) {
        if (!text) return '';

        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

            let encrypted = cipher.update(JSON.stringify(text), 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const authTag = cipher.getAuthTag();

            return JSON.stringify({
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                encrypted: encrypted
            });
        } catch (error) {
            // If encryption fails, return empty to avoid storing plain data
            return '';
        }
    }

    // Decrypt data after retrieving
    decrypt(encryptedData) {
        if (!encryptedData) return null;

        try {
            const data = JSON.parse(encryptedData);
            const iv = Buffer.from(data.iv, 'hex');
            const authTag = Buffer.from(data.authTag, 'hex');
            const encrypted = data.encrypted;

            const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);
        } catch (error) {
            // If decryption fails, return null
            return null;
        }
    }

    // Set item in localStorage with encryption
    setItem(key, value) {
        try {
            const encrypted = this.encrypt(value);
            localStorage.setItem(key, encrypted);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Get item from localStorage with decryption
    getItem(key) {
        try {
            const encrypted = localStorage.getItem(key);
            if (!encrypted) return null;
            return this.decrypt(encrypted);
        } catch (error) {
            return null;
        }
    }

    // Remove item from localStorage
    removeItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Clear all items
    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            return false;
        }
    }

    // Check if storage is available
    isAvailable() {
        try {
            const test = '__test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (error) {
            return false;
        }
    }
}

// Export for browser use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SecureStorage;
} else {
    window.SecureStorage = SecureStorage;
}