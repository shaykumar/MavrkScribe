// Input sanitization and validation utilities
class Sanitizer {
    // Escape HTML to prevent XSS
    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';

        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\//g, "&#x2F;");
    }

    // Sanitize user input for display
    sanitizeInput(input) {
        if (!input) return '';

        // Remove any script tags
        input = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

        // Remove any event handlers
        input = input.replace(/on\w+\s*=\s*"[^"]*"/gi, '');
        input = input.replace(/on\w+\s*=\s*'[^']*'/gi, '');
        input = input.replace(/on\w+\s*=\s*[^\s>]*/gi, '');

        // Remove javascript: protocol
        input = input.replace(/javascript:/gi, '');

        return this.escapeHtml(input);
    }

    // Validate email format
    validateEmail(email) {
        const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return re.test(String(email).toLowerCase());
    }

    // Validate and sanitize file paths
    sanitizePath(path) {
        if (!path) return '';

        // Remove any directory traversal attempts
        path = path.replace(/\.\./g, '');
        path = path.replace(/~\//g, '');

        // Remove any null bytes
        path = path.replace(/\0/g, '');

        return path;
    }

    // Sanitize JSON data
    sanitizeJSON(data) {
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                return null;
            }
        }

        // Recursively sanitize object values
        if (typeof data === 'object' && data !== null) {
            for (let key in data) {
                if (typeof data[key] === 'string') {
                    data[key] = this.sanitizeInput(data[key]);
                } else if (typeof data[key] === 'object') {
                    data[key] = this.sanitizeJSON(data[key]);
                }
            }
        }

        return data;
    }

    // Create safe DOM element with text content
    createSafeElement(tag, content, className = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = content; // Use textContent, not innerHTML
        return element;
    }

    // Sanitize for Markdown display (keeps some formatting)
    sanitizeMarkdown(markdown) {
        if (!markdown) return '';

        // Allow only safe markdown elements
        let safe = markdown;

        // Remove HTML tags except for allowed ones
        safe = safe.replace(/<(?!\/?(b|i|em|strong|code|pre|blockquote|ul|ol|li|h[1-6]|p|br|hr)(?=>|\s.*>))\/?[^>]*>/gi, '');

        // Remove dangerous attributes
        safe = safe.replace(/\s(on\w+|style|javascript:|data:)(\s*=\s*["'][^"']*["'])?/gi, '');

        return safe;
    }
}

module.exports = new Sanitizer();