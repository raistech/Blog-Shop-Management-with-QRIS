const crypto = require('crypto');

/**
 * Generate unique invoice number
 * Format: INV-YYYYMMDD-XXXXXX
 */
function generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    
    return `INV-${year}${month}${day}-${random}`;
}

/**
 * Generate unique code (1-999) for payment verification
 */
function generateUniqueCode() {
    return Math.floor(Math.random() * 999) + 1;
}

/**
 * Generate secure download token
 */
function generateDownloadToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate product slug from name
 */
function generateSlug(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Format currency to IDR
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
}

/**
 * Format date to Indonesian format with WIB timezone
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
        hour12: false
    }).format(date);
}

/**
 * Generate random product ID
 */
function generateProductId() {
    return `PRD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Sanitize phone number (remove non-numeric characters)
 */
function sanitizePhoneNumber(phone) {
    if (!phone) return null;
    
    let cleaned = phone.replace(/\D/g, '');
    
    // Convert 08xx to 628xx
    if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.substring(1);
    }
    
    // Ensure it starts with 62
    if (!cleaned.startsWith('62')) {
        cleaned = '62' + cleaned;
    }
    
    return cleaned;
}

/**
 * Generate random string for various purposes
 */
function randomString(length = 8) {
    return crypto.randomBytes(length).toString('hex').substring(0, length);
}

/**
 * Format date to WIB timezone for views
 * Usage in EJS: <%= formatDateWIB(date, options) %>
 * IMPORTANT: Uses manual UTC+7 conversion for reliability across all browsers
 */
function formatDateWIB(dateString, options = {}) {
    const date = new Date(dateString);
    
    // Manual UTC to WIB conversion (UTC +7 hours)
    const wibTime = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    
    const day = String(wibTime.getUTCDate()).padStart(2, '0');
    const month = wibTime.getUTCMonth() + 1;
    const year = wibTime.getUTCFullYear();
    const hour = String(wibTime.getUTCHours()).padStart(2, '0');
    const minute = String(wibTime.getUTCMinutes()).padStart(2, '0');
    
    const monthNames = {
        long: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
               'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
        short: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 
                'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    };
    
    // Build format based on options
    let result = '';
    
    if (options.day) result += day;
    if (options.month === 'long') result += ` ${monthNames.long[month - 1]}`;
    else if (options.month === 'short') result += ` ${monthNames.short[month - 1]}`;
    else if (options.month === '2-digit') result += `.${String(month).padStart(2, '0')}`;
    if (options.year === 'numeric') result += ` ${year}`;
    else if (options.year === '2-digit') result += ` ${String(year).slice(-2)}`;
    
    if (options.hour && options.minute) {
        result += ` pukul ${hour}.${minute}`;
    } else if (options.hour) {
        result += ` ${hour}`;
    }
    
    return result.trim();
}

module.exports = {
    generateInvoiceNumber,
    generateUniqueCode,
    generateDownloadToken,
    generateSlug,
    formatCurrency,
    formatDate,
    formatDateWIB,
    generateProductId,
    isValidEmail,
    sanitizePhoneNumber,
    randomString
};
