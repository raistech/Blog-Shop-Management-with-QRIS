/**
 * Product Management Routes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getDB, getSettings } = require('./database');
const { generateProductId, generateSlug } = require('./utils');

// Configure multer for file uploads (supports both product files and images)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Route to correct folder based on field name
        if (file.fieldname === 'image_file') {
            cb(null, 'uploads/images/');
        } else {
            cb(null, 'uploads/products/');
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Add 'img-' prefix for images
        if (file.fieldname === 'image_file') {
            cb(null, 'img-' + uniqueSuffix + path.extname(file.originalname));
        } else {
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: function (req, file, cb) {
        // Validate images for image_file field
        if (file.fieldname === 'image_file') {
            if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
                return cb(new Error('Only image files are allowed!'), false);
            }
        }
        cb(null, true);
    }
});

// Configure multer for image uploads
const imageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/images/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'img-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadImage = multer({
    storage: imageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for images
    fileFilter: function (req, file, cb) {
        // Accept images only
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Helper function to delete old image file
function deleteOldImage(imagePath) {
    if (!imagePath || !imagePath.startsWith('/uploads/')) return;
    
    const fs = require('fs');
    const fullPath = path.join(__dirname, imagePath);
    
    fs.unlink(fullPath, (err) => {
        if (err) {
            console.log('Could not delete old image:', imagePath, err.message);
        } else {
            console.log('Deleted old image:', imagePath);
        }
    });
}

// Middleware to check admin auth
function checkAdminAuth(req, res, next) {
    if (!req.session || !req.session.adminId) {
        return res.redirect('/admin/login');
    }
    
    const { getAdminById } = require('./auth');
    getAdminById(req.session.adminId, (err, user) => {
        if (err || !user) {
            req.session.destroy();
            return res.redirect('/admin/login');
        }
        
        req.adminUser = user;
        req.session.adminUser = { username: user.username, email: user.email };
        next();
    });
}

// ==================== PRODUCT ROUTES ====================

// Products List
router.get('/', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    getSettings((err, settings) => {
        db.all('SELECT * FROM categories ORDER BY sort_order, name', [], (err, categories) => {
            db.all(
                `SELECT p.*, c.name as category_name 
                 FROM products p 
                 LEFT JOIN categories c ON p.category_id = c.id 
                 WHERE p.is_active = 1
                 ORDER BY p.created_at DESC`,
                [],
                (err, products) => {
                    db.close();
                    
                    res.render('admin/products', {
                        pageTitle: 'Products',
                        currentPage: 'products',
                        settings,
                        adminUser: req.adminUser,
                        products: products || [],
                        categories: categories || []
                    });
                }
            );
        });
    });
});

// Create Product Page
router.get('/create', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    getSettings((err, settings) => {
        db.all('SELECT * FROM categories ORDER BY name', [], (err, categories) => {
            db.close();
            
            res.render('admin/product-editor', {
                pageTitle: 'Create Product',
                currentPage: 'products',
                settings,
                adminUser: req.adminUser,
                product: null,
                categories: categories || []
            });
        });
    });
});

// Create Product Handler
router.post('/create', checkAdminAuth, upload.fields([
    { name: 'product_file', maxCount: 1 },
    { name: 'image_file', maxCount: 1 }
]), (req, res) => {
    console.log('=== CREATE PRODUCT REQUEST ===');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    
    const {
        name, description, price, category_id, stock,
        is_digital, download_link, image_url, file_type, features, image_upload_marker, file_upload_marker
    } = req.body;
    
    if (!name || !price) {
        console.error('Validation failed: name or price missing');
        return res.status(400).json({ error: 'Name and price are required' });
    }
    
    const productId = generateProductId();
    const slug = generateSlug(name);
    
    // Handle product file: prioritize file upload over download_link (not both)
    let finalFilePath = null;
    let finalDownloadLink = null;
    
    if (req.files?.product_file && file_upload_marker === '1') {
        // If file uploaded (confirmed by marker), use it
        finalFilePath = `/uploads/products/${req.files.product_file[0].filename}`;
        finalDownloadLink = null; // Clear download link
    } else if (download_link && download_link.trim() !== '') {
        // If no file but download_link provided, use download_link
        finalFilePath = null;
        finalDownloadLink = download_link.trim();
    }
    
    // Handle image: prioritize file upload over URL (not both)
    let finalImageUrl = null;
    if (req.files?.image_file && image_upload_marker === '1') {
        // If file uploaded (confirmed by marker), use it
        finalImageUrl = `/uploads/images/${req.files.image_file[0].filename}`;
    } else if (image_url && image_url.trim() !== '') {
        // If no file but URL provided, use URL
        finalImageUrl = image_url.trim();
    }
    
    console.log('Create product - Image URL:', finalImageUrl, '(from file:', !!req.files?.image_file, 'marker:', image_upload_marker, ')');
    
    const db = getDB();
    
    // Parse features from textarea (one per line) to JSON array
    const featuresArray = features ? features.split('\n').map(f => f.trim()).filter(f => f) : [];
    const featuresJSON = JSON.stringify(featuresArray);
    
    const productData = {
        id: productId,
        name: name,
        slug: slug,
        description: description || '',
        price: parseInt(price) || 0,
        category_id: category_id || null,
        stock: parseInt(stock) || 0,
        is_digital: is_digital ? 1 : 0,
        file_path: finalFilePath,
        download_link: finalDownloadLink,
        image_url: finalImageUrl,
        file_type: file_type || null,
        features: featuresJSON,
        is_active: 1
    };
    
    console.log('Inserting product:', productData);
    
    db.run(
        `INSERT INTO products (id, name, slug, description, price, category_id, stock, is_digital, 
         file_path, download_link, image_url, file_type, features, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            productData.id, productData.name, productData.slug, productData.description,
            productData.price, productData.category_id, productData.stock, productData.is_digital,
            productData.file_path, productData.download_link, productData.image_url,
            productData.file_type, productData.features, productData.is_active
        ],
        function(err) {
            if (err) {
                console.error('Database error creating product:', err);
                db.close();
                return res.status(500).json({ error: 'Failed to create product: ' + err.message });
            }
            
            console.log('Product created successfully, ID:', productId);
            db.close();
            
            // Redirect to products list instead of JSON response
            res.redirect('/admin/products?success=Product created successfully');
        }
    );
});

// Edit Product Page
router.get('/edit/:id', checkAdminAuth, (req, res) => {
    const productId = req.params.id;
    const db = getDB();
    
    getSettings((err, settings) => {
        db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
            if (err || !product) {
                db.close();
                return res.status(404).send('Product not found');
            }
            
            db.all('SELECT * FROM categories ORDER BY name', [], (err, categories) => {
                db.close();
                
                res.render('admin/product-editor', {
                    pageTitle: 'Edit Product',
                    currentPage: 'products',
                    settings,
                    adminUser: req.adminUser,
                    product: product,
                    categories: categories || []
                });
            });
        });
    });
});

// Update Product Handler
router.post('/edit/:id', checkAdminAuth, upload.fields([
    { name: 'product_file', maxCount: 1 },
    { name: 'image_file', maxCount: 1 }
]), (req, res) => {
    const productId = req.params.id;
    const {
        name, description, price, category_id, stock,
        is_digital, download_link, image_url, file_type, features, old_image_url, image_upload_marker, 
        old_file_path, file_upload_marker
    } = req.body;
    
    if (!name || !price) {
        return res.status(400).json({ error: 'Name and price are required' });
    }
    
    const slug = generateSlug(name);
    
    // Handle product file: prioritize file upload over download_link (not both)
    let finalFilePath = null;
    let finalDownloadLink = null;
    
    if (req.files?.product_file && file_upload_marker === '1') {
        // If file uploaded (confirmed by marker), use it
        finalFilePath = `/uploads/products/${req.files.product_file[0].filename}`;
        finalDownloadLink = null;
        
        // Delete old file if it's different and is a local file
        if (old_file_path && old_file_path !== finalFilePath && old_file_path.startsWith('/uploads/')) {
            deleteOldImage(old_file_path);
        }
    } else if (download_link && download_link.trim() !== '') {
        // If no file but download_link provided, use download_link
        finalFilePath = null;
        finalDownloadLink = download_link.trim();
        
        // If changed from local file to download_link, delete old file
        if (old_file_path && old_file_path.startsWith('/uploads/')) {
            deleteOldImage(old_file_path);
        }
    } else {
        // No new file and no download_link: keep old values
        finalFilePath = old_file_path || null;
        finalDownloadLink = null;
    }
    
    // Handle image: prioritize file upload over URL (not both)
    let finalImageUrl = null;
    if (req.files?.image_file && image_upload_marker === '1') {
        // If file uploaded (confirmed by marker), use it
        finalImageUrl = `/uploads/images/${req.files.image_file[0].filename}`;
        
        // Delete old image if it's different and is a local file
        if (old_image_url && old_image_url !== finalImageUrl && old_image_url.startsWith('/uploads/')) {
            deleteOldImage(old_image_url);
        }
    } else if (image_url && image_url.trim() !== '') {
        // If no file but URL provided, use URL
        finalImageUrl = image_url.trim();
        
        // If URL changed and old was local file, delete it
        if (old_image_url && old_image_url !== finalImageUrl && old_image_url.startsWith('/uploads/')) {
            deleteOldImage(old_image_url);
        }
    } else {
        // No new file and no URL: keep old image
        finalImageUrl = old_image_url || null;
    }
    
    console.log('Update product - Old:', old_image_url, 'New:', finalImageUrl, '(from file:', !!req.files?.image_file, 'marker:', image_upload_marker, ')');
    
    const db = getDB();
    
    // Parse features from textarea (one per line) to JSON array
    const featuresArray = features ? features.split('\n').map(f => f.trim()).filter(f => f) : [];
    const featuresJSON = JSON.stringify(featuresArray);
    
    let updateQuery = `UPDATE products SET name = ?, slug = ?, description = ?, price = ?, 
                       category_id = ?, stock = ?, is_digital = ?, download_link = ?, 
                       image_url = ?, file_type = ?, features = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?`;
    let params = [
        name, slug, description, parseInt(price), category_id || null,
        parseInt(stock) || 0, is_digital ? 1 : 0, finalDownloadLink,
        finalImageUrl, file_type || null, featuresJSON, finalFilePath, productId
    ];
    
    db.run(updateQuery, params, function(err) {
        db.close();
        
        if (err) {
            console.error('Error updating product:', err);
            return res.status(500).json({ error: 'Failed to update product' });
        }
        
        // Redirect to products list with success message
        res.redirect('/admin/products?success=Product updated successfully');
    });
});

// Delete Product
router.post('/delete/:id', checkAdminAuth, (req, res) => {
    const productId = req.params.id;
    const db = getDB();
    
    // Soft delete: set inactive and modify slug to prevent constraint error
    const deletedSlugSuffix = '_deleted_' + Date.now();
    
    db.run(
        'UPDATE products SET is_active = 0, slug = slug || ? WHERE id = ?', 
        [deletedSlugSuffix, productId], 
        function(err) {
            db.close();
            
            if (err) {
                console.error('Error deleting product:', err);
                return res.status(500).json({ error: 'Failed to delete product' });
            }
            
            res.json({ success: true });
        }
    );
});

// ==================== CATEGORY ROUTES ====================

// Categories List
router.get('/categories', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    getSettings((err, settings) => {
        db.all(
            `SELECT c.*, 
                    COUNT(DISTINCT p.id) as product_count,
                    COUNT(DISTINCT CASE WHEN o.status = 'paid' THEN o.id END) as order_count
             FROM categories c 
             LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
             LEFT JOIN orders o ON p.id = o.product_id
             GROUP BY c.id 
             ORDER BY c.sort_order, c.name`,
            [],
            (err, categories) => {
                if (err) {
                    console.error('Error fetching categories:', err);
                }
                db.close();
                
                res.render('admin/categories', {
                    pageTitle: 'Categories',
                    currentPage: 'categories',
                    settings,
                    adminUser: req.adminUser,
                    categories: categories || []
                });
            }
        );
    });
});

// Create Category
router.post('/categories/create', checkAdminAuth, (req, res) => {
    const { name, description, icon, sort_order } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    const slug = generateSlug(name);
    const db = getDB();
    
    db.run(
        'INSERT INTO categories (name, slug, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
        [name, slug, description || null, icon || '📦', parseInt(sort_order) || 0],
        function(err) {
            db.close();
            
            if (err) {
                console.error('Error creating category:', err);
                return res.status(500).json({ error: 'Failed to create category' });
            }
            
            res.json({ success: true, categoryId: this.lastID });
        }
    );
});

// Update Category
router.post('/categories/edit/:id', checkAdminAuth, (req, res) => {
    const categoryId = req.params.id;
    const { name, description, icon, sort_order } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    const slug = generateSlug(name);
    const db = getDB();
    
    db.run(
        'UPDATE categories SET name = ?, slug = ?, description = ?, icon = ?, sort_order = ? WHERE id = ?',
        [name, slug, description || null, icon || '📦', parseInt(sort_order) || 0, categoryId],
        function(err) {
            db.close();
            
            if (err) {
                console.error('Error updating category:', err);
                return res.status(500).json({ error: 'Failed to update category' });
            }
            
            res.json({ success: true });
        }
    );
});

// Delete Category
router.post('/categories/delete/:id', checkAdminAuth, (req, res) => {
    const categoryId = req.params.id;
    const db = getDB();
    
    // Check if category has ACTIVE products only (ignore deleted products)
    db.get('SELECT COUNT(*) as count FROM products WHERE category_id = ? AND is_active = 1', [categoryId], (err, result) => {
        if (result && result.count > 0) {
            db.close();
            return res.status(400).json({ error: 'Cannot delete category with active products. Move or delete products first.' });
        }
        
        // Also set category_id to NULL for any inactive products (cleanup)
        db.run('UPDATE products SET category_id = NULL WHERE category_id = ? AND is_active = 0', [categoryId], (err) => {
            if (err) {
                console.error('Error cleaning up inactive products:', err);
            }
            
            // Now delete the category
            db.run('DELETE FROM categories WHERE id = ?', [categoryId], function(err) {
                db.close();
                
                if (err) {
                    console.error('Error deleting category:', err);
                    return res.status(500).json({ error: 'Failed to delete category' });
                }
                
                res.json({ success: true });
            });
        });
    });
});

// ==================== IMAGE UPLOAD ====================

// Upload Product Image
router.post('/upload-image', checkAdminAuth, uploadImage.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    const imageUrl = `/uploads/images/${req.file.filename}`;
    res.json({ success: true, imageUrl: imageUrl });
});

module.exports = router;
