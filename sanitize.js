/**
 * Input Sanitization Utilities
 * Prevents XSS and other injection attacks
 */

const validator = require('validator');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

// Setup DOMPurify for server-side
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * Sanitize email address
 */
function sanitizeEmail(email) {
    if (!email || typeof email !== 'string') return null;
    
    const trimmed = email.trim().toLowerCase();
    
    // Validate email format
    if (!validator.isEmail(trimmed)) {
        return null;
    }
    
    // Normalize email
    return validator.normalizeEmail(trimmed, {
        gmail_remove_dots: false,
        gmail_remove_subaddress: false
    });
}

/**
 * Sanitize plain text input (escape HTML)
 */
function sanitizeText(text, maxLength = null) {
    if (!text || typeof text !== 'string') return '';
    
    let sanitized = text.trim();
    
    // Apply max length if specified
    if (maxLength && sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }
    
    // Escape HTML entities
    return validator.escape(sanitized);
}

/**
 * Sanitize HTML content (for blog posts, descriptions)
 * Allows safe HTML tags but removes dangerous content
 */
function sanitizeHTML(html) {
    if (!html || typeof html !== 'string') return '';
    
    // DOMPurify configuration - allow common safe tags
    const cleanHTML = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'code', 'pre',
            'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span'
        ],
        ALLOWED_ATTR: [
            'href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'
        ],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    });
    
    return cleanHTML;
}

/**
 * Sanitize URL
 */
function sanitizeURL(url) {
    if (!url || typeof url !== 'string') return '';
    
    const trimmed = url.trim();
    
    // Check if valid URL format
    if (!validator.isURL(trimmed, {
        protocols: ['http', 'https'],
        require_protocol: true
    })) {
        return '';
    }
    
    return trimmed;
}

/**
 * Sanitize phone number (WhatsApp format)
 */
function sanitizePhone(phone) {
    if (!phone || typeof phone !== 'string') return '';
    
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Remove leading zeros
    cleaned = cleaned.replace(/^0+/, '');
    
    // Add country code if not present (assume Indonesia)
    if (!cleaned.startsWith('62')) {
        cleaned = '62' + cleaned;
    }
    
    // Validate length (Indonesian phone: 62 + 9-12 digits)
    if (cleaned.length < 11 || cleaned.length > 15) {
        return '';
    }
    
    return cleaned;
}

/**
 * Sanitize invoice number
 */
function sanitizeInvoiceNumber(invoice) {
    if (!invoice || typeof invoice !== 'string') return '';
    
    // Only allow alphanumeric and hyphens
    return invoice.trim().replace(/[^A-Za-z0-9\-]/g, '');
}

/**
 * Sanitize slug (for URLs)
 */
function sanitizeSlug(slug) {
    if (!slug || typeof slug !== 'string') return '';
    
    return slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Sanitize integer input
 */
function sanitizeInteger(value, min = null, max = null) {
    const num = parseInt(value, 10);
    
    if (isNaN(num)) return null;
    
    if (min !== null && num < min) return min;
    if (max !== null && num > max) return max;
    
    return num;
}

/**
 * Sanitize boolean input
 */
function sanitizeBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1';
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    return false;
}

/**
 * Sanitize object with multiple fields
 */
function sanitizeObject(obj, schema) {
    const sanitized = {};
    
    for (const [key, config] of Object.entries(schema)) {
        const value = obj[key];
        
        switch (config.type) {
            case 'email':
                sanitized[key] = sanitizeEmail(value);
                break;
            case 'text':
                sanitized[key] = sanitizeText(value, config.maxLength);
                break;
            case 'html':
                sanitized[key] = sanitizeHTML(value);
                break;
            case 'url':
                sanitized[key] = sanitizeURL(value);
                break;
            case 'phone':
                sanitized[key] = sanitizePhone(value);
                break;
            case 'invoice':
                sanitized[key] = sanitizeInvoiceNumber(value);
                break;
            case 'slug':
                sanitized[key] = sanitizeSlug(value);
                break;
            case 'integer':
                sanitized[key] = sanitizeInteger(value, config.min, config.max);
                break;
            case 'boolean':
                sanitized[key] = sanitizeBoolean(value);
                break;
            default:
                sanitized[key] = value;
        }
        
        // Check required fields
        if (config.required && !sanitized[key]) {
            return { error: `${key} is required and invalid` };
        }
    }
    
    return sanitized;
}

module.exports = {
    sanitizeEmail,
    sanitizeText,
    sanitizeHTML,
    sanitizeURL,
    sanitizePhone,
    sanitizeInvoiceNumber,
    sanitizeSlug,
    sanitizeInteger,
    sanitizeBoolean,
    sanitizeObject
};
