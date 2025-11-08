/**
 * Blog Routes - CMS functionality
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { marked } = require('marked');
const { getDB, getSettings } = require('./database');
const { generateSlug, generateDownloadToken } = require('./utils');

// Configure multer for image uploads
const imageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/images/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'blog-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadImage = multer({
    storage: imageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
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

// Middleware to check admin auth (import from routes-admin.js logic)
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

// ==================== ADMIN BLOG MANAGEMENT ====================

// Blog Categories Management
router.get('/categories', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    getSettings((err, settings) => {
        db.all(`
            SELECT 
                bc.*,
                COUNT(p.id) as post_count
            FROM blog_categories bc
            LEFT JOIN posts p ON bc.id = p.category_id
            GROUP BY bc.id
            ORDER BY bc.name
        `, [], (err, categories) => {
            db.close();
            
            res.render('admin/blog-categories', {
                pageTitle: 'Blog Categories',
                currentPage: 'blog-categories',
                settings,
                adminUser: req.adminUser,
                categories: categories || []
            });
        });
    });
});

// Create Blog Category
router.post('/categories/create', checkAdminAuth, (req, res) => {
    const { name, description } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const db = getDB();
    
    db.run(
        'INSERT INTO blog_categories (name, slug, description) VALUES (?, ?, ?)',
        [name, slug, description || ''],
        function(err) {
            db.close();
            if (err) {
                return res.status(500).json({ error: 'Failed to create category' });
            }
            res.json({ success: true, id: this.lastID });
        }
    );
});

// Update Blog Category
router.post('/categories/edit/:id', checkAdminAuth, (req, res) => {
    const { name, description } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const db = getDB();
    
    db.run(
        'UPDATE blog_categories SET name = ?, slug = ?, description = ? WHERE id = ?',
        [name, slug, description || '', req.params.id],
        function(err) {
            db.close();
            if (err) {
                return res.status(500).json({ error: 'Failed to update category' });
            }
            res.json({ success: true });
        }
    );
});

// Delete Blog Category
router.post('/categories/delete/:id', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    db.run('DELETE FROM blog_categories WHERE id = ?', [req.params.id], function(err) {
        db.close();
        if (err) {
            return res.status(500).json({ error: 'Failed to delete category' });
        }
        res.json({ success: true });
    });
});

// Blog Posts List
router.get('/posts', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    getSettings((err, settings) => {
        db.all(
            `SELECT p.*, au.username as author_name 
             FROM posts p 
             LEFT JOIN admin_users au ON p.author_id = au.id 
             ORDER BY p.created_at DESC`,
            [],
            (err, posts) => {
                db.close();
                
                res.render('admin/posts', {
                    pageTitle: 'Blog Posts',
                    currentPage: 'blog',
                    settings,
                    adminUser: req.adminUser,
                    posts: posts || []
                });
            }
        );
    });
});

// Create Post Page
router.get('/posts/create', checkAdminAuth, (req, res) => {
    const db = getDB();
    
    getSettings((err, settings) => {
        db.all('SELECT * FROM blog_categories ORDER BY name', [], (err, categories) => {
            db.close();
            
            res.render('admin/post-editor', {
                pageTitle: 'Create Post',
                currentPage: 'blog',
                settings,
                adminUser: req.adminUser,
                post: null,
                categories: categories || []
            });
        });
    });
});

// Create Post Handler
router.post('/posts/create', checkAdminAuth, uploadImage.single('featured_image_file'), (req, res) => {
    console.log('=== CREATE POST REQUEST ===');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    
    const { title, excerpt, content, featured_image, category_id, status, featured_image_marker } = req.body;
    
    if (!title || !content) {
        console.error('Validation failed: title or content missing');
        return res.status(400).json({ error: 'Title and content are required' });
    }
    
    const slug = generateSlug(title);
    const publishedAt = status === 'published' ? new Date().toISOString() : null;
    const categoryIdValue = category_id ? parseInt(category_id) : null;
    
    // Handle featured image: prioritize file upload over URL (not both)
    let finalFeaturedImage = null;
    if (req.file && featured_image_marker === '1') {
        // If file uploaded (confirmed by marker), use it
        finalFeaturedImage = `/uploads/images/${req.file.filename}`;
    } else if (featured_image && featured_image.trim() !== '') {
        // If no file but URL provided, use URL
        finalFeaturedImage = featured_image.trim();
    }
    
    const db = getDB();
    
    console.log('Creating post:', { title, slug, category_id: categoryIdValue, status, publishedAt, featured_image: finalFeaturedImage });
    
    db.run(
        `INSERT INTO posts (title, slug, excerpt, content, featured_image, category_id, author_id, status, published_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, slug, excerpt || '', content, finalFeaturedImage, categoryIdValue, req.session.adminId, status, publishedAt],
        function(err) {
            if (err) {
                console.error('Database error creating post:', err);
                db.close();
                return res.status(500).json({ error: 'Failed to create post: ' + err.message });
            }
            
            const postId = this.lastID;
            console.log('Post created successfully, ID:', postId);
            db.close();
            
            // Redirect to posts list
            res.redirect('/admin/blog/posts?success=Post created successfully');
        }
    );
});

// Edit Post Page
router.get('/posts/edit/:id', checkAdminAuth, (req, res) => {
    const postId = req.params.id;
    const db = getDB();
    
    getSettings((err, settings) => {
        // Get blog categories
        db.all('SELECT * FROM blog_categories ORDER BY name', [], (err, categories) => {
            // Get post
            db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, post) => {
                if (err || !post) {
                    db.close();
                    return res.status(404).send('Post not found');
                }
                
                // Get downloads for this post
                db.all(
                    'SELECT * FROM post_downloads WHERE post_id = ?',
                    [postId],
                    (err, downloads) => {
                        db.close();
                        
                        res.render('admin/post-editor', {
                            pageTitle: 'Edit Post',
                            currentPage: 'blog',
                            settings,
                            adminUser: req.adminUser,
                            post: post,
                            categories: categories || [],
                            downloads: downloads || []
                        });
                    }
                );
            });
        });
    });
});

// Update Post Handler
router.post('/posts/edit/:id', checkAdminAuth, uploadImage.single('featured_image_file'), (req, res) => {
    const postId = req.params.id;
    const { title, excerpt, content, featured_image, category_id, status, old_featured_image, featured_image_marker } = req.body;
    
    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
    }
    
    const slug = generateSlug(title);
    const categoryIdValue = category_id ? parseInt(category_id) : null;
    
    // Handle featured image: prioritize file upload over URL (not both)
    let finalFeaturedImage = null;
    if (req.file && featured_image_marker === '1') {
        // If file uploaded (confirmed by marker), use it
        finalFeaturedImage = `/uploads/images/${req.file.filename}`;
        
        // Delete old image if it's different and is a local file
        if (old_featured_image && old_featured_image !== finalFeaturedImage && old_featured_image.startsWith('/uploads/')) {
            deleteOldImage(old_featured_image);
        }
    } else if (featured_image && featured_image.trim() !== '') {
        // If no file but URL provided, use URL
        finalFeaturedImage = featured_image.trim();
        
        // If URL changed and old was local file, delete it
        if (old_featured_image && old_featured_image !== finalFeaturedImage && old_featured_image.startsWith('/uploads/')) {
            deleteOldImage(old_featured_image);
        }
    } else {
        // No new file and no URL: keep old image
        finalFeaturedImage = old_featured_image || null;
    }
    
    console.log('Update featured image - Old:', old_featured_image, 'New:', finalFeaturedImage, '(from file:', !!req.file, 'marker:', featured_image_marker, ')');
    
    const db = getDB();
    
    // Check if status changed to published
    db.get('SELECT status FROM posts WHERE id = ?', [postId], (err, currentPost) => {
        const publishedAt = (status === 'published' && currentPost.status !== 'published') 
            ? new Date().toISOString() 
            : undefined;
        
        let updateQuery = `UPDATE posts SET title = ?, slug = ?, excerpt = ?, content = ?, 
                          featured_image = ?, category_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP`;
        let params = [title, slug, excerpt, content, finalFeaturedImage, categoryIdValue, status];
        
        if (publishedAt) {
            updateQuery += ', published_at = ?';
            params.push(publishedAt);
        }
        
        updateQuery += ' WHERE id = ?';
        params.push(postId);
        
        db.run(updateQuery, params, function(err) {
            db.close();
            
            if (err) {
                console.error('Error updating post:', err);
                return res.status(500).json({ error: 'Failed to update post' });
            }
            
            // Redirect to posts list with success message
            res.redirect('/admin/blog/posts?success=Post updated successfully');
        });
    });
});

// Delete Post
router.post('/posts/delete/:id', checkAdminAuth, (req, res) => {
    const postId = req.params.id;
    const db = getDB();
    
    db.run('DELETE FROM posts WHERE id = ?', [postId], function(err) {
        db.close();
        
        if (err) {
            console.error('Error deleting post:', err);
            return res.status(500).json({ error: 'Failed to delete post' });
        }
        
        res.json({ success: true });
    });
});

// Add Download to Post
router.post('/posts/:id/downloads', checkAdminAuth, (req, res) => {
    const postId = req.params.id;
    const { title, file_url, file_size, requires_token } = req.body;
    
    if (!title || !file_url) {
        return res.status(400).json({ error: 'Title and file URL are required' });
    }
    
    const db = getDB();
    
    db.run(
        `INSERT INTO post_downloads (post_id, title, file_url, file_size, requires_token) 
         VALUES (?, ?, ?, ?, ?)`,
        [postId, title, file_url, file_size || 0, requires_token ? 1 : 0],
        function(err) {
            db.close();
            
            if (err) {
                console.error('Error adding download:', err);
                return res.status(500).json({ error: 'Failed to add download' });
            }
            
            res.json({ success: true, downloadId: this.lastID });
        }
    );
});

// Delete Download
router.post('/posts/downloads/delete/:id', checkAdminAuth, (req, res) => {
    const downloadId = req.params.id;
    const db = getDB();
    
    db.run('DELETE FROM post_downloads WHERE id = ?', [downloadId], function(err) {
        db.close();
        
        if (err) {
            return res.status(500).json({ error: 'Failed to delete download' });
        }
        
        res.json({ success: true });
    });
});

// ==================== IMAGE UPLOAD ====================

// Upload Blog Image
router.post('/upload-image', checkAdminAuth, uploadImage.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    const imageUrl = `/uploads/images/${req.file.filename}`;
    res.json({ success: true, imageUrl: imageUrl });
});

// ==================== PUBLIC BLOG ROUTES ====================

// Blog Home
router.get('/', (req, res) => {
    const db = getDB();
    const page = parseInt(req.query.page) || 1;
    const categorySlug = req.query.category;
    const perPage = 9;
    const offset = (page - 1) * perPage;
    
    getSettings((err, settings) => {
        // Get all blog categories
        db.all('SELECT * FROM blog_categories ORDER BY name', [], (err, categories) => {
            if (err) {
                console.error('Error getting blog categories:', err);
                categories = [];
            }
            
            // Build query with category filter
            let countQuery = 'SELECT COUNT(*) as total FROM posts p WHERE p.status = \'published\'';
            let params = [];
            
            if (categorySlug) {
                countQuery += ' AND p.category_id = (SELECT id FROM blog_categories WHERE slug = ?)';
                params.push(categorySlug);
            }
            
            // Get total count
            db.get(countQuery, params, (err, countResult) => {
                const totalPosts = countResult?.total || 0;
                const totalPages = Math.ceil(totalPosts / perPage);
                
                // Build posts query with category filter
                let postsQuery = `SELECT p.*, au.username as author_name, bc.name as category_name, bc.slug as category_slug 
                                 FROM posts p 
                                 LEFT JOIN admin_users au ON p.author_id = au.id 
                                 LEFT JOIN blog_categories bc ON p.category_id = bc.id 
                                 WHERE p.status = 'published'`;
                let postsParams = [];
                
                if (categorySlug) {
                    postsQuery += ' AND p.category_id = (SELECT id FROM blog_categories WHERE slug = ?)';
                    postsParams.push(categorySlug);
                }
                
                postsQuery += ' ORDER BY p.published_at DESC LIMIT ? OFFSET ?';
                postsParams.push(perPage, offset);
                
                // Get posts
                db.all(postsQuery, postsParams, (err, posts) => {
                    db.close();
                    
                    res.render('blog/index', {
                        settings,
                        posts: posts || [],
                        categories: categories || [],
                        selectedCategory: categorySlug || null,
                        currentPage: page,
                        totalPages: totalPages,
                        pageTitle: 'Blog'
                    });
                });
            });
        });
    });
});

// Single Post
router.get('/:slug', (req, res) => {
    const slug = req.params.slug;
    const db = getDB();
    
    getSettings((err, settings) => {
        db.get(
            `SELECT p.*, au.username as author_name 
             FROM posts p 
             LEFT JOIN admin_users au ON p.author_id = au.id 
             WHERE p.slug = ? AND p.status = 'published'`,
            [slug],
            (err, post) => {
                if (err || !post) {
                    db.close();
                    return res.status(404).send('Post not found');
                }
                
                // Increment views
                db.run('UPDATE posts SET views = views + 1 WHERE id = ?', [post.id]);
                
                // Get downloads
                db.all(
                    'SELECT * FROM post_downloads WHERE post_id = ?',
                    [post.id],
                    (err, downloads) => {
                        db.close();
                        
                        // Convert Markdown to HTML
                        const contentHtml = marked(post.content || '');
                        
                        res.render('blog/post', {
                            settings,
                            post: post,
                            contentHtml: contentHtml,
                            downloads: downloads || [],
                            pageTitle: post.title
                        });
                    }
                );
            }
        );
    });
});

// Generate Download Token (No Email Required)
router.post('/download/generate-token', (req, res) => {
    const { download_id } = req.body;
    
    if (!download_id) {
        return res.status(400).json({ error: 'Download ID is required' });
    }
    
    const db = getDB();
    
    db.get('SELECT * FROM post_downloads WHERE id = ?', [download_id], (err, download) => {
        if (err || !download) {
            db.close();
            return res.status(404).json({ error: 'Download not found' });
        }
        
        // Generate token
        const token = generateDownloadToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
        
        db.run(
            `INSERT INTO blog_download_tokens (token, post_download_id, email, expires_at) 
             VALUES (?, ?, ?, ?)`,
            [token, download_id, null, expiresAt], // email = null
            function(err) {
                db.close();
                
                if (err) {
                    console.error('Error generating token:', err);
                    return res.status(500).json({ error: 'Failed to generate download link' });
                }
                
                const downloadUrl = `/blog/download/${token}`;
                
                res.json({ 
                    success: true, 
                    downloadUrl: downloadUrl,
                    expiresIn: '24 hours',
                    token: token
                });
            }
        );
    });
});

// Request Download Token (Legacy with Email - Optional)
router.post('/download/request', (req, res) => {
    const { download_id, email } = req.body;
    
    if (!download_id || !email) {
        return res.status(400).json({ error: 'Download ID and email are required' });
    }
    
    const db = getDB();
    
    db.get('SELECT * FROM post_downloads WHERE id = ?', [download_id], (err, download) => {
        if (err || !download) {
            db.close();
            return res.status(404).json({ error: 'Download not found' });
        }
        
        // Generate token
        const token = generateDownloadToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
        
        db.run(
            `INSERT INTO blog_download_tokens (token, post_download_id, email, expires_at) 
             VALUES (?, ?, ?, ?)`,
            [token, download_id, email, expiresAt],
            function(err) {
                db.close();
                
                if (err) {
                    console.error('Error generating token:', err);
                    return res.status(500).json({ error: 'Failed to generate download link' });
                }
                
                const downloadUrl = `/blog/download/${token}`;
                
                // TODO: Send email with download link
                
                res.json({ 
                    success: true, 
                    downloadUrl: downloadUrl,
                    expiresIn: '1 hour'
                });
            }
        );
    });
});

// Download File with Token
router.get('/download/:token', (req, res) => {
    const token = req.params.token;
    const db = getDB();
    
    db.get(
        `SELECT bdt.*, pd.file_url, pd.file_path, pd.title 
         FROM blog_download_tokens bdt 
         JOIN post_downloads pd ON bdt.post_download_id = pd.id 
         WHERE bdt.token = ?`,
        [token],
        (err, tokenData) => {
            if (err || !tokenData) {
                db.close();
                return res.status(404).send('Invalid download link');
            }
            
            // Check expiry
            const now = new Date();
            const expiresAt = new Date(tokenData.expires_at);
            
            if (now > expiresAt) {
                db.close();
                return res.status(410).send('Download link has expired');
            }
            
            // Update download count
            db.run(
                `UPDATE blog_download_tokens SET download_count = download_count + 1, is_used = 1 
                 WHERE token = ?`,
                [token]
            );
            
            db.run(
                'UPDATE post_downloads SET download_count = download_count + 1 WHERE id = ?',
                [tokenData.post_download_id]
            );
            
            db.close();
            
            // Redirect to file URL or serve file
            if (tokenData.file_url) {
                res.redirect(tokenData.file_url);
            } else if (tokenData.file_path) {
                const filePath = path.join(__dirname, tokenData.file_path);
                
                // Preserve original file extension
                const originalExtension = path.extname(tokenData.file_path);
                let downloadFilename = tokenData.title;
                
                // Add extension if not already present
                if (originalExtension && !downloadFilename.toLowerCase().endsWith(originalExtension.toLowerCase())) {
                    downloadFilename += originalExtension;
                }
                
                res.download(filePath, downloadFilename);
            } else {
                res.status(404).send('File not found');
            }
        }
    );
});

module.exports = router;
