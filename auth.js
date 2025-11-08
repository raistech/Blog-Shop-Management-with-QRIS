const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { getDB } = require('./database');

const SALT_ROUNDS = 10;

/**
 * Check if any admin user exists
 */
function hasAdminUser(callback) {
    const db = getDB();
    db.get('SELECT COUNT(*) as count FROM admin_users', [], (err, row) => {
        db.close();
        if (err) {
            return callback(err, false);
        }
        callback(null, row.count > 0);
    });
}

/**
 * Create first admin user
 */
async function createAdminUser(username, password, email, callback) {
    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const db = getDB();
        
        db.run(
            'INSERT INTO admin_users (username, password, email) VALUES (?, ?, ?)',
            [username, hashedPassword, email],
            function(err) {
                db.close();
                if (err) {
                    return callback(err);
                }
                callback(null, this.lastID);
            }
        );
    } catch (error) {
        callback(error);
    }
}

/**
 * Verify admin login credentials
 */
async function verifyAdminCredentials(username, password, callback) {
    const db = getDB();
    
    db.get('SELECT * FROM admin_users WHERE username = ?', [username], async (err, user) => {
        db.close();
        
        if (err) {
            return callback(err, null);
        }
        
        if (!user) {
            return callback(null, null);
        }
        
        try {
            const isValid = await bcrypt.compare(password, user.password);
            if (isValid) {
                callback(null, user);
            } else {
                callback(null, null);
            }
        } catch (error) {
            callback(error, null);
        }
    });
}

/**
 * Update admin password
 */
async function updateAdminPassword(userId, newPassword, callback) {
    try {
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        const db = getDB();
        
        db.run(
            'UPDATE admin_users SET password = ? WHERE id = ?',
            [hashedPassword, userId],
            function(err) {
                db.close();
                callback(err);
            }
        );
    } catch (error) {
        callback(error);
    }
}

/**
 * Generate 2FA secret
 */
function generate2FASecret(username, callback) {
    try {
        const secret = speakeasy.generateSecret({
            name: `RSA Store (${username})`,
            issuer: 'RSA Store'
        });
        
        // Generate QR code
        qrcode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
            if (err) {
                return callback(err);
            }
            
            callback(null, {
                secret: secret.base32,
                qrCode: dataUrl,
                otpauth_url: secret.otpauth_url
            });
        });
    } catch (error) {
        callback(error);
    }
}

/**
 * Enable 2FA for user
 */
function enable2FA(userId, secret, callback) {
    const db = getDB();
    
    db.run(
        'UPDATE admin_users SET two_fa_secret = ?, two_fa_enabled = 1 WHERE id = ?',
        [secret, userId],
        function(err) {
            db.close();
            callback(err);
        }
    );
}

/**
 * Disable 2FA for user
 */
function disable2FA(userId, callback) {
    const db = getDB();
    
    db.run(
        'UPDATE admin_users SET two_fa_secret = NULL, two_fa_enabled = 0 WHERE id = ?',
        [userId],
        function(err) {
            db.close();
            callback(err);
        }
    );
}

/**
 * Verify 2FA token
 */
function verify2FAToken(secret, token) {
    return speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
        window: 2 // Allow 2 time steps before/after for clock drift
    });
}

/**
 * Get admin user by ID
 */
function getAdminById(userId, callback) {
    const db = getDB();
    
    db.get('SELECT * FROM admin_users WHERE id = ?', [userId], (err, user) => {
        db.close();
        callback(err, user);
    });
}

/**
 * Update last login time
 */
function updateLastLogin(userId, callback) {
    const db = getDB();
    
    db.run(
        'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        [userId],
        function(err) {
            db.close();
            if (callback) callback(err);
        }
    );
}

/**
 * Log admin action
 */
function logAdminAction(userId, action, description, ipAddress, callback) {
    const db = getDB();
    
    db.run(
        'INSERT INTO admin_logs (user_id, action, description, ip_address) VALUES (?, ?, ?, ?)',
        [userId, action, description, ipAddress],
        function(err) {
            db.close();
            if (callback) callback(err);
        }
    );
}

/**
 * Get recent admin logs
 */
function getRecentLogs(limit, callback) {
    const db = getDB();
    
    db.all(
        `SELECT al.*, au.username 
         FROM admin_logs al 
         LEFT JOIN admin_users au ON al.user_id = au.id 
         ORDER BY al.created_at DESC 
         LIMIT ?`,
        [limit],
        (err, logs) => {
            db.close();
            callback(err, logs);
        }
    );
}

module.exports = {
    hasAdminUser,
    createAdminUser,
    verifyAdminCredentials,
    updateAdminPassword,
    generate2FASecret,
    enable2FA,
    disable2FA,
    verify2FAToken,
    getAdminById,
    updateLastLogin,
    logAdminAction,
    getRecentLogs
};
