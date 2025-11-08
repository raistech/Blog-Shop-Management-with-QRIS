/**
 * Admin Routes - Authentication & Management
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
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
} = require('./auth');
const { getDB, getSettings, updateSetting } = require('./database');

// Login rate limiter - strict for security
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Max 5 login attempts per IP
    message: 'Too many login attempts, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
});

// Middleware to check if setup is complete
function checkSetupComplete(req, res, next) {
    hasAdminUser((err, hasUser) => {
        if (err) {
            return res.status(500).send('Server error');
        }
        
        if (!hasUser && req.path !== '/setup') {
            return res.redirect('/admin/setup');
        }
        
        if (hasUser && req.path === '/setup') {
            return res.redirect('/admin/login');
        }
        
        next();
    });
}

// Middleware to check admin authentication
function checkAdminAuth(req, res, next) {
    if (!req.session || !req.session.adminId) {
        return res.redirect('/admin/login');
    }
    
    getAdminById(req.session.adminId, (err, user) => {
        if (err || !user) {
            req.session.destroy();
            return res.redirect('/admin/login');
        }
        
        req.adminUser = user;
        next();
    });
}

// ==================== SETUP WIZARD ====================

// First-time Setup Page
router.get('/setup', checkSetupComplete, (req, res) => {
    getSettings((err, settings) => {
        res.render('admin/setup', {
            pageTitle: 'Setup',
            currentPage: 'setup',
            settings,
            error: null,
            success: null
        });
    });
});

// Process Setup
router.post('/setup', checkSetupComplete, async (req, res) => {
    const { username, email, password, confirm_password } = req.body;
    
    // Validation
    if (!username || !password || !confirm_password) {
        return getSettings((err, settings) => {
            res.render('admin/setup', {
                settings,
                error: 'All fields are required',
                success: null
            });
        });
    }
    
    if (password.length < 8) {
        return getSettings((err, settings) => {
            res.render('admin/setup', {
                settings,
                error: 'Password must be at least 8 characters',
                success: null
            });
        });
    }
    
    if (password !== confirm_password) {
        return getSettings((err, settings) => {
            res.render('admin/setup', {
                settings,
                error: 'Passwords do not match',
                success: null
            });
        });
    }
    
    // Create admin user
    createAdminUser(username, password, email, (err, userId) => {
        if (err) {
            console.error('Setup error:', err);
            return getSettings((err, settings) => {
                res.render('admin/setup', {
                    settings,
                    error: 'Failed to create admin account. Username might already exist.',
                    success: null
                });
            });
        }
        
        // Log action
        logAdminAction(userId, 'SETUP', 'First-time setup completed', req.ip);
        
        // Auto-login after setup
        req.session.adminId = userId;
        req.session.adminUsername = username;
        
        res.redirect('/admin/dashboard');
    });
});

// ==================== LOGIN & AUTHENTICATION ====================

// Admin Login Page
router.get('/login', checkSetupComplete, (req, res) => {
    if (req.session && req.session.adminId) {
        return res.redirect('/admin/dashboard');
    }
    
    res.render('admin/login', {
        error: null,
        require2FA: false,
        tempUserId: null
    });
});

// Process Login
router.post('/login', loginLimiter, checkSetupComplete, (req, res) => {
    const { username, password, token_2fa } = req.body;
    
    // Check if this is 2FA verification (token_2fa present but password might be empty from hidden field)
    const is2FAStep = token_2fa && token_2fa.trim() !== '';
    
    if (!username || (!password && !is2FAStep)) {
        return res.render('admin/login', {
            error: 'Username and password are required',
            require2FA: false,
            tempUserId: null
        });
    }
    
    // For 2FA step, we need to get user by username only (no password verification needed again)
    if (is2FAStep) {
        const { getDB } = require('./database');
        const db = getDB();
        
        db.get('SELECT * FROM admin_users WHERE username = ?', [username], (err, user) => {
            db.close();
            
            if (err || !user) {
                return res.render('admin/login', {
                    error: 'Session expired. Please login again.',
                    require2FA: false,
                    tempUserId: null
                });
            }
            
            // Verify 2FA token
            const isValid = verify2FAToken(user.two_fa_secret, token_2fa);
            
            if (!isValid) {
                return res.render('admin/login', {
                    error: 'Invalid 2FA token',
                    require2FA: true,
                    tempUserId: user.id,
                    tempUsername: username
                });
            }
            
            // 2FA successful - login
            req.session.adminId = user.id;
            req.session.adminUsername = user.username;
            
            // Update last login
            updateLastLogin(user.id);
            
            // Log action
            logAdminAction(user.id, 'LOGIN', 'Admin logged in with 2FA', req.ip);
            
            res.redirect('/admin/dashboard');
        });
        
        return;
    }
    
    // Normal login flow (username + password)
    verifyAdminCredentials(username, password, (err, user) => {
        if (err) {
            console.error('Login error:', err);
            return res.render('admin/login', {
                error: 'Server error',
                require2FA: false,
                tempUserId: null
            });
        }
        
        if (!user) {
            return res.render('admin/login', {
                error: 'Invalid username or password',
                require2FA: false,
                tempUserId: null
            });
        }
        
        // Check if 2FA is enabled
        if (user.two_fa_enabled) {
            // Show 2FA input
            return res.render('admin/login', {
                error: null,
                require2FA: true,
                tempUserId: user.id,
                tempUsername: username
            });
        }
        
        // Login successful (no 2FA)
        req.session.adminId = user.id;
        req.session.adminUsername = user.username;
        
        // Update last login
        updateLastLogin(user.id);
        
        // Log action
        logAdminAction(user.id, 'LOGIN', 'Admin logged in', req.ip);
        
        res.redirect('/admin/dashboard');
    });
});

// Admin Logout
router.get('/logout', (req, res) => {
    const userId = req.session?.adminId;
    
    if (userId) {
        logAdminAction(userId, 'LOGOUT', 'Admin logged out', req.ip);
    }
    
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
});

// ==================== DASHBOARD ====================

router.get('/dashboard', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    getSettings((err, settings) => {
        // Get statistics
        db.get('SELECT COUNT(*) as total FROM products WHERE is_active = 1', [], (err, productCount) => {
            db.get('SELECT COUNT(*) as total FROM orders WHERE status = \'paid\'', [], (err, orderCount) => {
                db.get('SELECT SUM(total_amount) as total FROM orders WHERE status = \'paid\'', [], (err, revenue) => {
                    db.get('SELECT COUNT(*) as total FROM orders WHERE status = \'pending\'', [], (err, pendingCount) => {
                        db.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10', [], (err, recentOrders) => {
                            // Get recent logs
                            getRecentLogs(10, (err, recentLogs) => {
                                db.close();
                                
                                res.render('admin/dashboard', {
                                    pageTitle: 'Dashboard',
                                    currentPage: 'dashboard',
                                    settings,
                                    adminUser: req.adminUser,
                                    stats: {
                                        products: productCount?.total || 0,
                                        orders: orderCount?.total || 0,
                                        revenue: revenue?.total || 0,
                                        pending: pendingCount?.total || 0
                                    },
                                    recentOrders: recentOrders || [],
                                    recentLogs: recentLogs || []
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ==================== ACCOUNT SETTINGS ====================

// Account Settings Page
router.get('/account', checkAdminAuth, (req, res) => {
    getSettings((err, settings) => {
        if (err) {
            console.error('Error getting settings:', err);
            return res.status(500).send('Server error');
        }
        
        res.render('admin/account', {
            pageTitle: 'Account Settings',
            currentPage: 'account',
            settings,
            adminUser: req.adminUser,
            error: null,
            success: null
        });
    });
});

// Change Password
router.post('/account/change-password', checkAdminAuth, (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;
    
    getSettings((err, settings) => {
        if (err) {
            console.error('Error getting settings:', err);
            return res.status(500).send('Server error');
        }
        
        // Validation
        if (!current_password || !new_password || !confirm_password) {
            return res.render('admin/account', {
                pageTitle: 'Account Settings',
                currentPage: 'account',
                settings,
                adminUser: req.adminUser,
                error: 'All password fields are required',
                success: null
            });
        }
        
        if (new_password.length < 8) {
            return res.render('admin/account', {
                pageTitle: 'Account Settings',
                currentPage: 'account',
                settings,
                adminUser: req.adminUser,
                error: 'New password must be at least 8 characters',
                success: null
            });
        }
        
        if (new_password !== confirm_password) {
            return res.render('admin/account', {
                pageTitle: 'Account Settings',
                currentPage: 'account',
                settings,
                adminUser: req.adminUser,
                error: 'New passwords do not match',
                success: null
            });
        }
        
        // Verify current password
        verifyAdminCredentials(req.adminUser.username, current_password, (err, user) => {
            if (err || !user) {
                return res.render('admin/account', {
                    pageTitle: 'Account Settings',
                    currentPage: 'account',
                    settings,
                    adminUser: req.adminUser,
                    error: 'Current password is incorrect',
                    success: null
                });
            }
            
            // Update password
            updateAdminPassword(req.adminUser.id, new_password, (err) => {
                if (err) {
                    console.error('Password update error:', err);
                    return res.render('admin/account', {
                        pageTitle: 'Account Settings',
                        currentPage: 'account',
                        settings,
                        adminUser: req.adminUser,
                        error: 'Failed to update password',
                        success: null
                    });
                }
                
                // Log action
                logAdminAction(req.adminUser.id, 'PASSWORD_CHANGE', 'Password changed', req.ip);
                
                res.render('admin/account', {
                    pageTitle: 'Account Settings',
                    currentPage: 'account',
                    settings,
                    adminUser: req.adminUser,
                    error: null,
                    success: 'Password updated successfully!'
                });
            });
        });
    });
});

// Setup 2FA
router.post('/account/setup-2fa', checkAdminAuth, (req, res) => {
    generate2FASecret(req.adminUser.username, (err, secretData) => {
        if (err) {
            console.error('2FA generation error:', err);
            return res.status(500).json({ error: 'Failed to generate 2FA secret' });
        }
        
        res.json({
            secret: secretData.secret,
            qrCode: secretData.qrCode
        });
    });
});

// Enable 2FA
router.post('/account/enable-2fa', checkAdminAuth, (req, res) => {
    const { secret, token } = req.body;
    
    if (!secret || !token) {
        return res.json({ success: false, error: 'Secret and token are required' });
    }
    
    // Verify token before enabling
    const isValid = verify2FAToken(secret, token);
    
    if (!isValid) {
        return res.json({ success: false, error: 'Invalid verification token' });
    }
    
    // Enable 2FA
    enable2FA(req.adminUser.id, secret, (err) => {
        if (err) {
            console.error('Enable 2FA error:', err);
            return res.json({ success: false, error: 'Failed to enable 2FA' });
        }
        
        // Log action
        logAdminAction(req.adminUser.id, '2FA_ENABLED', '2FA authentication enabled', req.ip);
        
        res.json({ success: true });
    });
});

// Disable 2FA
router.post('/account/disable-2fa', checkAdminAuth, (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.json({ success: false, error: 'Password is required' });
    }
    
    // Verify password before disabling
    verifyAdminCredentials(req.adminUser.username, password, (err, user) => {
        if (err || !user) {
            return res.json({ success: false, error: 'Invalid password' });
        }
        
        // Disable 2FA
        disable2FA(req.adminUser.id, (err) => {
            if (err) {
                console.error('Disable 2FA error:', err);
                return res.json({ success: false, error: 'Failed to disable 2FA' });
            }
            
            // Log action
            logAdminAction(req.adminUser.id, '2FA_DISABLED', '2FA authentication disabled', req.ip);
            
            res.json({ success: true });
        });
    });
});

// ==================== SETTINGS ====================

// Settings Page
router.get('/settings', checkAdminAuth, (req, res) => {
    getSettings((err, settings) => {
        res.render('admin/settings', {
            pageTitle: 'Settings',
            currentPage: 'settings',
            settings,
            adminUser: req.adminUser,
            message: null
        });
    });
});

// Helper function to delete old image file
function deleteOldImageFile(imagePath) {
    if (!imagePath || !imagePath.startsWith('/uploads/')) return;
    
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.join(__dirname, imagePath);
    
    fs.unlink(fullPath, (err) => {
        if (err) {
            console.log('Could not delete old image:', imagePath, err.message);
        } else {
            console.log('Deleted old image:', imagePath);
        }
    });
}

// Settings Update with file upload support
const multer = require('multer');
const path = require('path');

const settingsStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/images/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const prefix = file.fieldname === 'logo_file' ? 'logo-' : 'favicon-';
        cb(null, prefix + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadSettings = multer({
    storage: settingsStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

router.post('/settings-update', checkAdminAuth, uploadSettings.fields([
    { name: 'logo_file', maxCount: 1 },
    { name: 'favicon_file', maxCount: 1 }
]), (req, res) => {
    const updates = req.body;
    
    console.log('=== SETTINGS UPDATE DEBUG ===');
    console.log('Received data:', JSON.stringify(updates, null, 2));
    console.log('Files:', req.files);
    console.log('Number of fields:', Object.keys(updates).length);
    console.log('============================');
    
    // Handle logo: prioritize file upload over URL (not both)
    if (req.files?.logo_file && updates.logo_upload_marker === '1') {
        // If file uploaded (confirmed by marker), use it
        const newLogoUrl = `/uploads/images/${req.files.logo_file[0].filename}`;
        updates.logo_url = newLogoUrl;
        
        // Delete old logo if it's a local file
        if (updates.old_logo_url && updates.old_logo_url !== newLogoUrl && updates.old_logo_url.startsWith('/uploads/')) {
            deleteOldImageFile(updates.old_logo_url);
        }
    } else if (!updates.logo_url || updates.logo_url.trim() === '') {
        // No file and no URL: keep old logo
        updates.logo_url = updates.old_logo_url || '';
    } else if (updates.logo_url !== updates.old_logo_url) {
        // URL changed: delete old if it was local file
        if (updates.old_logo_url && updates.old_logo_url.startsWith('/uploads/')) {
            deleteOldImageFile(updates.old_logo_url);
        }
    }
    
    // Handle favicon: prioritize file upload over URL (not both)
    if (req.files?.favicon_file && updates.favicon_upload_marker === '1') {
        // If file uploaded (confirmed by marker), use it
        const newFaviconUrl = `/uploads/images/${req.files.favicon_file[0].filename}`;
        updates.favicon_url = newFaviconUrl;
        
        // Delete old favicon if it's a local file
        if (updates.old_favicon_url && updates.old_favicon_url !== newFaviconUrl && updates.old_favicon_url.startsWith('/uploads/')) {
            deleteOldImageFile(updates.old_favicon_url);
        }
    } else if (!updates.favicon_url || updates.favicon_url.trim() === '') {
        // No file and no URL: keep old favicon
        updates.favicon_url = updates.old_favicon_url || '';
    } else if (updates.favicon_url !== updates.old_favicon_url) {
        // URL changed: delete old if it was local file
        if (updates.old_favicon_url && updates.old_favicon_url.startsWith('/uploads/')) {
            deleteOldImageFile(updates.old_favicon_url);
        }
    }
    
    console.log('Logo - Old:', updates.old_logo_url, 'New:', updates.logo_url, 'marker:', updates.logo_upload_marker);
    console.log('Favicon - Old:', updates.old_favicon_url, 'New:', updates.favicon_url, 'marker:', updates.favicon_upload_marker);
    
    // Remove markers from updates before saving to database
    delete updates.logo_upload_marker;
    delete updates.favicon_upload_marker;
    
    // Remove old_* fields from updates
    delete updates.old_logo_url;
    delete updates.old_favicon_url;
    
    const db = getDB();
    
    db.serialize(() => {
        const stmt = db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');
        
        let updateCount = 0;
        for (const [key, value] of Object.entries(updates)) {
            console.log(`Updating: ${key} = ${value}`);
            stmt.run(value, key, function(err) {
                if (err) {
                    console.error(`Error updating ${key}:`, err);
                } else {
                    console.log(`✓ Updated ${key}, changes: ${this.changes}`);
                }
            });
            updateCount++;
        }
        
        console.log(`Total fields to update: ${updateCount}`);
        
        stmt.finalize((err) => {
            if (err) {
                console.error('Error finalizing statement:', err);
            }
            
            // Log action
            logAdminAction(req.adminUser.id, 'SETTINGS_UPDATE', 'Settings updated', req.ip);
            
            db.close();
            
            getSettings((err, settings) => {
                console.log('Settings after update:', JSON.stringify({
                    webhook_api_key: settings.webhook_api_key,
                    smtp_username: settings.smtp_username,
                    smtp_password: settings.smtp_password ? '***hidden***' : 'empty',
                    logo_url: settings.logo_url,
                    favicon_url: settings.favicon_url
                }, null, 2));
                
                res.render('admin/settings', {
                    pageTitle: 'Settings',
                    currentPage: 'settings',
                    settings,
                    adminUser: req.adminUser,
                    message: 'Settings updated successfully!'
                });
            });
        });
    });
});

// ==================== ORDERS ====================

// Resend Invoice Email
router.post('/orders/:invoiceNumber/resend-invoice', checkAdminAuth, (req, res) => {
    const { invoiceNumber } = req.params;
    const db = getDB();
    const { generateDownloadToken } = require('./utils');
    const { sendInvoiceEmail } = require('./email');
    
    getSettings((err, settings) => {
        if (err) {
            console.error('Error getting settings:', err);
            return res.status(500).json({ success: false, error: 'Failed to get settings' });
        }
        
        db.get('SELECT * FROM orders WHERE invoice_number = ? AND status = \'paid\'', [invoiceNumber], (err, order) => {
            if (err) {
                console.error('Error fetching order:', err);
                db.close();
                return res.status(500).json({ success: false, error: 'Database error' });
            }
            
            if (!order) {
                db.close();
                return res.status(404).json({ success: false, error: 'Order not found or not paid' });
            }
            
            if (!order.customer_email) {
                db.close();
                return res.status(400).json({ success: false, error: 'No email address found for this order' });
            }
            
            const token = generateDownloadToken();
            const expiryMinutes = parseInt(settings.token_expiry_minutes) || 60;
            const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
            
            db.run(
                'INSERT INTO download_tokens (token, invoice_number, product_id, expires_at) VALUES (?, ?, ?, ?)',
                [token, order.invoice_number, order.product_id, expiresAt],
                function(err) {
                    if (err) {
                        console.error('Error creating download token:', err);
                        db.close();
                        return res.status(500).json({ success: false, error: 'Failed to create download token' });
                    }
                    
                    sendInvoiceEmail(settings, order, token)
                        .then(() => {
                            logAdminAction(req.adminUser.id, 'RESEND_INVOICE', `Resent invoice email for ${invoiceNumber}`, req.ip);
                            db.close();
                            res.json({ 
                                success: true, 
                                message: 'Invoice email sent successfully',
                                email: order.customer_email
                            });
                        })
                        .catch(emailErr => {
                            console.error('Error sending email:', emailErr);
                            db.close();
                            res.status(500).json({ 
                                success: false, 
                                error: 'Email sending failed. Token created but email not delivered.' 
                            });
                        });
                }
            );
        });
    });
});

// Orders Page
router.get('/orders', checkAdminAuth, (req, res) => {
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';
    const db = getDB();
    
    getSettings((err, settings) => {
        let query = 'SELECT * FROM orders WHERE 1=1';
        const params = [];
        
        if (search) {
            query += ' AND (invoice_number LIKE ? OR product_name LIKE ? OR customer_email LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        
        if (statusFilter) {
            query += ' AND status = ?';
            params.push(statusFilter);
        }
        
        query += ' ORDER BY created_at DESC';
        
        db.all(query, params, (err, orders) => {
            db.close();
            
            res.render('admin/orders', {
                pageTitle: 'Orders',
                currentPage: 'orders',
                settings,
                adminUser: req.adminUser,
                orders: orders || [],
                search: search,
                statusFilter: statusFilter
            });
        });
    });
});

// ==================== FAQ MANAGEMENT ====================

// FAQ List
router.get('/faqs', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    getSettings((err, settings) => {
        db.all('SELECT * FROM faqs ORDER BY sort_order, id', [], (err, faqs) => {
            db.close();
            
            res.render('admin/faqs', {
                pageTitle: 'Manage FAQs',
                currentPage: 'faqs',
                settings,
                adminUser: req.adminUser,
                faqs: faqs || []
            });
        });
    });
});

// Create FAQ
router.post('/faqs/create', checkAdminAuth, (req, res) => {
    const { question, answer, sort_order } = req.body;
    const db = getDB();
    
    db.run(
        'INSERT INTO faqs (question, answer, sort_order) VALUES (?, ?, ?)',
        [question, answer, sort_order || 0],
        function(err) {
            db.close();
            if (err) {
                return res.status(500).json({ error: 'Failed to create FAQ' });
            }
            res.json({ success: true, id: this.lastID });
        }
    );
});

// Update FAQ
router.post('/faqs/edit/:id', checkAdminAuth, (req, res) => {
    const { question, answer, sort_order, is_active } = req.body;
    const db = getDB();
    
    db.run(
        'UPDATE faqs SET question = ?, answer = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [question, answer, sort_order || 0, is_active ? 1 : 0, req.params.id],
        function(err) {
            db.close();
            if (err) {
                return res.status(500).json({ error: 'Failed to update FAQ' });
            }
            res.json({ success: true });
        }
    );
});

// Delete FAQ
router.post('/faqs/delete/:id', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    db.run('DELETE FROM faqs WHERE id = ?', [req.params.id], function(err) {
        db.close();
        if (err) {
            return res.status(500).json({ error: 'Failed to delete FAQ' });
        }
        res.json({ success: true });
    });
});

// ==================== PAGES MANAGEMENT ====================

// Pages List
router.get('/pages', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    getSettings((err, settings) => {
        db.all('SELECT * FROM pages ORDER BY title', [], (err, pages) => {
            db.close();
            
            res.render('admin/pages', {
                pageTitle: 'Manage Pages',
                currentPage: 'pages',
                settings,
                adminUser: req.adminUser,
                pages: pages || []
            });
        });
    });
});

// Create/Edit Page
router.get('/pages/:action/:id?', checkAdminAuth, (req, res) => {
    const action = req.params.action;
    const pageId = req.params.id;
    const db = getDB();
    
    getSettings((err, settings) => {
        if (action === 'create') {
            db.close();
            res.render('admin/page-editor', {
                pageTitle: 'Create Page',
                currentPage: 'pages',
                settings,
                adminUser: req.adminUser,
                page: null
            });
        } else if (action === 'edit' && pageId) {
            db.get('SELECT * FROM pages WHERE id = ?', [pageId], (err, page) => {
                db.close();
                if (!page) {
                    return res.status(404).send('Page not found');
                }
                res.render('admin/page-editor', {
                    pageTitle: 'Edit Page',
                    currentPage: 'pages',
                    settings,
                    adminUser: req.adminUser,
                    page
                });
            });
        }
    });
});

// Create Page Handler
router.post('/pages/create', checkAdminAuth, (req, res) => {
    const { title, content } = req.body;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const db = getDB();
    
    db.run(
        'INSERT INTO pages (title, slug, content) VALUES (?, ?, ?)',
        [title, slug, content],
        function(err) {
            db.close();
            if (err) {
                return res.status(500).json({ error: 'Failed to create page' });
            }
            res.redirect('/admin/pages?success=Page created');
        }
    );
});

// Update Page Handler
router.post('/pages/edit/:id', checkAdminAuth, (req, res) => {
    const { title, content, is_active } = req.body;
    const db = getDB();
    
    db.run(
        'UPDATE pages SET title = ?, content = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [title, content, is_active ? 1 : 0, req.params.id],
        function(err) {
            db.close();
            if (err) {
                return res.status(500).json({ error: 'Failed to update page' });
            }
            res.redirect('/admin/pages?success=Page updated');
        }
    );
});

// Delete Page
router.post('/pages/delete/:id', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    db.run('DELETE FROM pages WHERE id = ?', [req.params.id], function(err) {
        db.close();
        if (err) {
            return res.status(500).json({ error: 'Failed to delete page' });
        }
        res.json({ success: true });
    });
});

// ==================== EXPIRED PAGE MANAGEMENT ====================

// Expired Page Editor
router.get('/expired-page', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    db.get('SELECT * FROM expired_page_content WHERE id = 1', [], (err, content) => {
        if (err || !content) {
            content = {
                title: 'Link Download Telah Kedaluwarsa',
                subtitle: 'Maaf, link download yang Anda akses sudah tidak berlaku lagi.',
                main_message: 'Link download memiliki masa berlaku terbatas untuk keamanan transaksi Anda.',
                cta_text: 'Request Link Download Baru',
                info_title: 'Informasi Penting'
            };
        }
        
        db.all('SELECT * FROM expired_page_faqs ORDER BY sort_order, id', [], (err, faqs) => {
            db.close();
            
            if (err) {
                faqs = [];
            }
            
            getSettings((err, settings) => {
                res.render('admin/expired-page-editor', {
                    pageTitle: 'Edit Expired Link Page',
                    currentPage: 'expired-page',
                    settings,
                    adminUser: req.adminUser,
                    content,
                    faqs,
                    message: req.query.success ? { type: 'success', text: req.query.success } : 
                            req.query.error ? { type: 'error', text: req.query.error } : null
                });
            });
        });
    });
});

// Update Expired Page Content
router.post('/expired-page/update-content', checkAdminAuth, (req, res) => {
    const { title, subtitle, main_message, cta_text, info_title } = req.body;
    const db = getDB();
    
    db.run(
        `UPDATE expired_page_content 
         SET title = ?, subtitle = ?, main_message = ?, cta_text = ?, info_title = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = 1`,
        [title, subtitle, main_message, cta_text, info_title],
        function(err) {
            db.close();
            
            if (err) {
                console.error('Error updating expired page content:', err);
                return res.redirect('/admin/expired-page?error=Failed to update content');
            }
            
            logAdminAction(req.session.adminId, 'expired_page_update', 'Updated expired page content', req.ip);
            res.redirect('/admin/expired-page?success=Content updated successfully');
        }
    );
});

// Create FAQ
router.post('/expired-page/faqs/create', checkAdminAuth, (req, res) => {
    const { question, answer, sort_order, is_active } = req.body;
    const db = getDB();
    
    db.run(
        'INSERT INTO expired_page_faqs (question, answer, sort_order, is_active) VALUES (?, ?, ?, ?)',
        [question, answer, sort_order || 0, is_active ? 1 : 0],
        function(err) {
            db.close();
            
            if (err) {
                console.error('Error creating FAQ:', err);
                return res.redirect('/admin/expired-page?error=Failed to create FAQ');
            }
            
            logAdminAction(req.session.adminId, 'expired_faq_create', `Created FAQ: ${question}`, req.ip);
            res.redirect('/admin/expired-page?success=FAQ created successfully');
        }
    );
});

// Update FAQ
router.post('/expired-page/faqs/update', checkAdminAuth, (req, res) => {
    const { faq_id, question, answer, sort_order, is_active } = req.body;
    const db = getDB();
    
    db.run(
        'UPDATE expired_page_faqs SET question = ?, answer = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [question, answer, sort_order || 0, is_active ? 1 : 0, faq_id],
        function(err) {
            db.close();
            
            if (err) {
                console.error('Error updating FAQ:', err);
                return res.redirect('/admin/expired-page?error=Failed to update FAQ');
            }
            
            logAdminAction(req.session.adminId, 'expired_faq_update', `Updated FAQ ID: ${faq_id}`, req.ip);
            res.redirect('/admin/expired-page?success=FAQ updated successfully');
        }
    );
});

// Delete FAQ
router.post('/expired-page/faqs/delete', checkAdminAuth, (req, res) => {
    const { faq_id } = req.body;
    const db = getDB();
    
    db.run('DELETE FROM expired_page_faqs WHERE id = ?', [faq_id], function(err) {
        db.close();
        
        if (err) {
            console.error('Error deleting FAQ:', err);
            return res.redirect('/admin/expired-page?error=Failed to delete FAQ');
        }
        
        logAdminAction(req.session.adminId, 'expired_faq_delete', `Deleted FAQ ID: ${faq_id}`, req.ip);
        res.redirect('/admin/expired-page?success=FAQ deleted successfully');
    });
});

// Export router
// ==================== BOT SETTINGS ====================

// Bot Settings Page
router.get('/bot-settings', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    db.get('SELECT * FROM bot_settings WHERE id = 1', [], (err, botSettings) => {
        if (err) {
            console.error('Error fetching bot settings:', err);
            botSettings = {};
        }
        
        getSettings((err, settings) => {
            db.close();
            
            res.render('admin/bot-settings', {
                pageTitle: 'Bot Settings',
                currentPage: 'bot-settings',
                settings,
                botSettings: botSettings || {},
                adminUser: req.adminUser,
                success: req.query.success,
                error: req.query.error
            });
        });
    });
});

// Update Telegram Bot Settings
router.post('/bot-settings/telegram', checkAdminAuth, async (req, res) => {
    const { telegram_bot_token, telegram_bot_enabled } = req.body;
    const db = getDB();
    
    db.run(
        `UPDATE bot_settings 
         SET telegram_bot_token = ?, 
             telegram_bot_enabled = ?,
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = 1`,
        [telegram_bot_token || null, telegram_bot_enabled === 'on' ? 1 : 0],
        function(err) {
            db.close();
            
            if (err) {
                console.error('Error updating Telegram bot settings:', err);
                return res.redirect('/admin/bot-settings?error=telegram_update_failed');
            }
            
            logAdminAction(req.session.adminId, 'telegram_bot_settings_update', 'Updated Telegram bot settings', req.ip, () => {});
            
            // Restart Telegram bot if enabled
            if (telegram_bot_enabled === 'on') {
                try {
                    const { startTelegramBot } = require('./bot-telegram');
                    startTelegramBot().catch(console.error);
                } catch (error) {
                    console.error('Error starting Telegram bot:', error);
                }
            }
            
            res.redirect('/admin/bot-settings?success=telegram_updated');
        }
    );
});

// Update WhatsApp Bot Settings
router.post('/bot-settings/whatsapp', checkAdminAuth, async (req, res) => {
    const { whatsapp_enabled } = req.body;
    const db = getDB();
    
    db.run(
        `UPDATE bot_settings 
         SET whatsapp_enabled = ?,
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = 1`,
        [whatsapp_enabled === 'on' ? 1 : 0],
        function(err) {
            db.close();
            
            if (err) {
                console.error('Error updating WhatsApp bot settings:', err);
                return res.redirect('/admin/bot-settings?error=whatsapp_update_failed');
            }
            
            logAdminAction(req.session.adminId, 'whatsapp_bot_settings_update', 'Updated WhatsApp bot settings', req.ip, () => {});
            
            // Start/stop WhatsApp bot
            try {
                const { initializeWhatsApp, disconnectWhatsApp } = require('./bot-whatsapp');
                if (whatsapp_enabled === 'on') {
                    initializeWhatsApp().catch(console.error);
                } else {
                    disconnectWhatsApp().catch(console.error);
                }
            } catch (error) {
                console.error('Error managing WhatsApp bot:', error);
            }
            
            res.redirect('/admin/bot-settings?success=whatsapp_updated');
        }
    );
});

// Get WhatsApp QR Code (API endpoint)
router.get('/bot-settings/whatsapp/qr', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    db.get('SELECT whatsapp_qr_code, whatsapp_qr_updated_at, whatsapp_session_status FROM bot_settings WHERE id = 1', [], (err, row) => {
        db.close();
        
        if (err || !row) {
            return res.json({ 
                status: 'error', 
                message: 'Failed to fetch QR code' 
            });
        }
        
        res.json({
            status: row.whatsapp_session_status || 'disconnected',
            qr_code: row.whatsapp_qr_code,
            updated_at: row.whatsapp_qr_updated_at
        });
    });
});

// Disconnect WhatsApp Bot
router.post('/bot-settings/whatsapp/disconnect', checkAdminAuth, async (req, res) => {
    try {
        const { disconnectWhatsApp } = require('./bot-whatsapp');
        await disconnectWhatsApp();
        
        logAdminAction(req.session.adminId, 'whatsapp_bot_disconnect', 'Disconnected WhatsApp bot', req.ip, () => {});
        
        res.redirect('/admin/bot-settings?success=whatsapp_disconnected');
    } catch (error) {
        console.error('Error disconnecting WhatsApp bot:', error);
        res.redirect('/admin/bot-settings?error=whatsapp_disconnect_failed');
    }
});

// Test WhatsApp Notification (via HTTP API to bot process)
router.post('/bot-settings/whatsapp/test', checkAdminAuth, async (req, res) => {
    try {
        const { phone_number } = req.body;
        
        if (!phone_number) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nomor WhatsApp harus diisi' 
            });
        }
        
        // Call WhatsApp bot HTTP API (inter-process communication)
        const axios = require('axios');
        
        try {
            const response = await axios.post('http://127.0.0.1:33418/test-notification', {
                phone_number: phone_number
            }, {
                timeout: 30000 // 30 seconds timeout
            });
            
            const data = response.data;
            
            if (data.success) {
                logAdminAction(req.session.adminId, 'whatsapp_test_notification', `Sent test notification to ${data.formatted_number}`, req.ip, () => {});
                
                res.json({ 
                    success: true, 
                    message: data.message || 'Test notification berhasil dikirim! Cek WhatsApp Anda.',
                    formatted_number: data.formatted_number
                });
            } else {
                res.json({ 
                    success: false, 
                    error: data.error || 'Gagal mengirim notification. Pastikan bot WhatsApp terkoneksi dan nomor terdaftar di WhatsApp.' 
                });
            }
        } catch (apiError) {
            // Check if it's a connection error (bot not running)
            if (apiError.code === 'ECONNREFUSED') {
                return res.json({
                    success: false,
                    error: 'Bot WhatsApp tidak berjalan. Silakan restart bot: pm2 restart rsastore-whatsapp-bot'
                });
            }
            
            // Check if it's a timeout
            if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
                return res.json({
                    success: false,
                    error: 'Request timeout. Bot mungkin masih initializing. Silakan tunggu beberapa saat dan coba lagi.'
                });
            }
            
            throw apiError; // Re-throw other errors
        }
    } catch (error) {
        console.error('Error sending test notification:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Terjadi kesalahan saat mengirim test notification' 
        });
    }
});

module.exports = router;
