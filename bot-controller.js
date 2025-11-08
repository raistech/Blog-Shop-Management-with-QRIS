// Bot Controller - Shared business logic for WhatsApp & Telegram bots
const { getDB, getSettings } = require('./database');
const logger = require('./logger');

// Format currency to IDR
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
}

// Get all active categories
async function getCategories() {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.all('SELECT * FROM categories ORDER BY sort_order, name', [], (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// Get products by category
async function getProductsByCategory(categoryId, limit = 10) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.all(
            `SELECT p.*, c.name as category_name, c.icon as category_icon 
             FROM products p 
             LEFT JOIN categories c ON p.category_id = c.id 
             WHERE p.category_id = ? AND p.is_active = 1 
             ORDER BY p.created_at DESC 
             LIMIT ?`,
            [categoryId, limit],
            (err, rows) => {
                db.close();
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
}

// Search products
async function searchProducts(query, limit = 10) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        const searchTerm = `%${query}%`;
        db.all(
            `SELECT p.*, c.name as category_name, c.icon as category_icon 
             FROM products p 
             LEFT JOIN categories c ON p.category_id = c.id 
             WHERE p.is_active = 1 AND (p.name LIKE ? OR p.description LIKE ?) 
             ORDER BY p.created_at DESC 
             LIMIT ?`,
            [searchTerm, searchTerm, limit],
            (err, rows) => {
                db.close();
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
}

// Get product by ID
async function getProductById(productId) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.get(
            `SELECT p.*, c.name as category_name, c.icon as category_icon 
             FROM products p 
             LEFT JOIN categories c ON p.category_id = c.id 
             WHERE p.id = ? AND p.is_active = 1`,
            [productId],
            (err, row) => {
                db.close();
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

// Check order status
async function checkOrderStatus(invoiceNumber) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.get(
            'SELECT * FROM orders WHERE invoice_number = ?',
            [invoiceNumber],
            (err, row) => {
                db.close();
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

// Format product message
function formatProductMessage(product) {
    let message = `*${product.name}*\n\n`;
    message += `${product.category_icon || '📦'} Kategori: ${product.category_name}\n`;
    message += `💰 Harga: ${formatCurrency(product.price)}\n`;
    message += `📦 Stok: ${product.stock > 0 ? product.stock + ' tersedia' : 'Habis'}\n`;
    message += product.is_digital ? `📲 Tipe: Digital\n` : `📦 Tipe: Fisik\n`;
    
    if (product.description) {
        message += `\n📝 Deskripsi:\n${product.description}\n`;
    }
    
    return message;
}

// Format order message
function formatOrderMessage(order) {
    let message = `🧾 *INVOICE #${order.invoice_number}*\n\n`;
    message += `📦 Produk: ${order.product_name}\n`;
    message += `💵 Harga: ${formatCurrency(order.product_price)}\n`;
    message += `🔢 Kode Unik: ${formatCurrency(order.unique_code)}\n`;
    message += `💰 *Total: ${formatCurrency(order.total_amount)}*\n\n`;
    
    const statusEmoji = {
        'pending': '⏳',
        'paid': '✅',
        'cancelled': '❌'
    };
    
    message += `${statusEmoji[order.status] || '❓'} Status: ${order.status.toUpperCase()}\n`;
    message += `📅 Dibuat: ${new Date(order.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n`;
    
    if (order.paid_at) {
        message += `✅ Dibayar: ${new Date(order.paid_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n`;
    }
    
    return message;
}

// Format categories list
function formatCategoriesList(categories) {
    let message = `🛍️ *KATALOG PRODUK*\n\nPilih kategori:\n\n`;
    categories.forEach((cat, index) => {
        message += `${cat.icon || '📦'} ${cat.name}\n`;
    });
    message += `\nKetik angka untuk memilih kategori`;
    return message;
}

// Format products list
function formatProductsList(products, categoryName) {
    if (!products || products.length === 0) {
        return `Maaf, tidak ada produk di kategori ${categoryName}.`;
    }
    
    let message = `${products[0].category_icon || '📦'} *${categoryName.toUpperCase()}*\n\n`;
    products.forEach((product, index) => {
        message += `${index + 1}. ${product.name}\n`;
        message += `   💰 ${formatCurrency(product.price)}\n`;
        message += `   📦 Stok: ${product.stock > 0 ? product.stock : 'Habis'}\n\n`;
    });
    message += `Ketik angka untuk lihat detail produk`;
    return message;
}

// Get bot welcome message
async function getWelcomeMessage() {
    const settings = await new Promise((resolve, reject) => {
        getSettings((err, settings) => {
            if (err) reject(err);
            else resolve(settings);
        });
    });
    
    let message = `👋 *Selamat Datang di ${settings.store_name || 'RSA Store'}!*\n\n`;
    message += `🛍️ Toko online terpercaya untuk produk digital & fisik\n\n`;
    message += `📋 *MENU UTAMA*\n\n`;
    message += `1️⃣ Lihat Katalog\n`;
    message += `2️⃣ Cari Produk\n`;
    message += `3️⃣ Cek Pesanan\n`;
    message += `4️⃣ Bantuan\n\n`;
    message += `Ketik angka pilihan Anda atau ketik "menu" untuk kembali ke menu utama.`;
    
    return message;
}

// Get help message
async function getHelpMessage() {
    const settings = await new Promise((resolve, reject) => {
        getSettings((err, settings) => {
            if (err) reject(err);
            else resolve(settings);
        });
    });
    
    let message = `❓ *BANTUAN & INFORMASI*\n\n`;
    message += `📞 *Kontak:*\n`;
    if (settings.store_whatsapp) {
        message += `WhatsApp: ${settings.store_whatsapp}\n`;
    }
    if (settings.store_telegram) {
        message += `Telegram: ${settings.store_telegram}\n`;
    }
    if (settings.store_email) {
        message += `Email: ${settings.store_email}\n`;
    }
    message += `\n🕒 *Jam Operasional:*\n`;
    message += `${settings.operating_hours_weekday || 'Senin-Jumat: 09:00-21:00'}\n`;
    message += `${settings.operating_hours_weekend || 'Sabtu-Minggu: 10:00-18:00'}\n\n`;
    message += `💡 *Tips:*\n`;
    message += `• Ketik "menu" untuk kembali ke menu utama\n`;
    message += `• Ketik "katalog" untuk lihat produk\n`;
    message += `• Ketik "cek INV-XXXXX" untuk cek pesanan\n`;
    
    return message;
}

module.exports = {
    formatCurrency,
    getCategories,
    getProductsByCategory,
    searchProducts,
    getProductById,
    checkOrderStatus,
    formatProductMessage,
    formatOrderMessage,
    formatCategoriesList,
    formatProductsList,
    getWelcomeMessage,
    getHelpMessage
};
