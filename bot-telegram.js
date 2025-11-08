// Telegram Bot with Inline Keyboard
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode');
const axios = require('axios');
const { getDB } = require('./database');
const logger = require('./logger');
const botController = require('./bot-controller');
const { generateInvoiceNumber, generateUniqueCode } = require('./utils');

const QRIS_SERVICE_URL = process.env.QRIS_SERVICE_URL || 'http://localhost:33416';

let bot = null;
let userSessions = new Map();

// Get bot token from database
async function getBotToken() {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.get('SELECT telegram_bot_token, telegram_bot_enabled FROM bot_settings WHERE id = 1', [], (err, row) => {
            db.close();
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// Get user session
function getUserSession(userId) {
    if (!userSessions.has(userId)) {
        userSessions.set(userId, {
            state: 'menu',
            data: {},
            lastActivity: Date.now()
        });
    }
    return userSessions.get(userId);
}

// Update user session
function updateUserSession(userId, updates) {
    const session = getUserSession(userId);
    Object.assign(session, updates, { lastActivity: Date.now() });
    userSessions.set(userId, session);
}

// Clear old sessions
setInterval(() => {
    const now = Date.now();
    const timeout = 30 * 60 * 1000;
    
    for (const [userId, session] of userSessions.entries()) {
        if (now - session.lastActivity > timeout) {
            userSessions.delete(userId);
        }
    }
}, 5 * 60 * 1000);

// Show main menu with inline keyboard
async function showMainMenu(chatId, messageId = null) {
    const welcomeMsg = await botController.getWelcomeMessage();
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '🛍️ Lihat Katalog', callback_data: 'menu_catalog' }],
            [{ text: '🔍 Cari Produk', callback_data: 'menu_search' }],
            [{ text: '📦 Cek Pesanan', callback_data: 'menu_check_order' }],
            [{ text: '❓ Bantuan', callback_data: 'menu_help' }]
        ]
    };
    
    const options = {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    };
    
    if (messageId) {
        await bot.editMessageText(welcomeMsg, {
            chat_id: chatId,
            message_id: messageId,
            ...options
        });
    } else {
        await bot.sendMessage(chatId, welcomeMsg, options);
    }
}

// Show categories with inline keyboard
async function showCategories(chatId, messageId = null) {
    const categories = await botController.getCategories();
    
    const keyboard = {
        inline_keyboard: categories.map(cat => [
            { 
                text: `${cat.icon || '📦'} ${cat.name}`, 
                callback_data: `cat_${cat.id}` 
            }
        ])
    };
    
    keyboard.inline_keyboard.push([
        { text: '🏠 Menu Utama', callback_data: 'menu_main' }
    ]);
    
    const message = '🛍️ *KATALOG PRODUK*\n\nPilih kategori:';
    const options = {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    };
    
    if (messageId) {
        await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            ...options
        });
    } else {
        await bot.sendMessage(chatId, message, options);
    }
    
    updateUserSession(chatId, { 
        state: 'category_list',
        data: { categories }
    });
}

// Show products with inline keyboard
async function showProducts(chatId, categoryId, messageId = null) {
    const products = await botController.getProductsByCategory(categoryId);
    const session = getUserSession(chatId);
    const categories = session.data.categories || await botController.getCategories();
    const category = categories.find(c => c.id === categoryId);
    
    if (!products || products.length === 0) {
        const keyboard = {
            inline_keyboard: [
                [{ text: '🔙 Kembali', callback_data: 'menu_catalog' }],
                [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
            ]
        };
        
        await bot.sendMessage(chatId, `❌ Tidak ada produk di kategori ${category?.name || 'ini'}.`, {
            reply_markup: keyboard
        });
        return;
    }
    
    const keyboard = {
        inline_keyboard: products.map(product => [
            { 
                text: `${product.name} - ${botController.formatCurrency(product.price)}`, 
                callback_data: `prod_${product.id}` 
            }
        ])
    };
    
    keyboard.inline_keyboard.push(
        [{ text: '🔙 Kembali', callback_data: 'menu_catalog' }],
        [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    );
    
    const message = `${category?.icon || '📦'} *${category?.name.toUpperCase() || 'PRODUK'}*\n\n` +
                   `Ditemukan ${products.length} produk. Pilih untuk lihat detail:`;
    
    const options = {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    };
    
    if (messageId) {
        await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            ...options
        });
    } else {
        await bot.sendMessage(chatId, message, options);
    }
    
    updateUserSession(chatId, {
        state: 'product_list',
        data: { categoryId, products }
    });
}

// Show product detail
async function showProductDetail(chatId, productId, messageId = null) {
    const product = await botController.getProductById(productId);
    
    if (!product) {
        await bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
        return;
    }
    
    const message = botController.formatProductMessage(product);
    
    const keyboard = {
        inline_keyboard: []
    };
    
    if (product.stock > 0) {
        keyboard.inline_keyboard.push([
            { text: '🛒 BELI SEKARANG', callback_data: `buy_${product.id}` }
        ]);
    } else {
        keyboard.inline_keyboard.push([
            { text: '❌ Stok Habis', callback_data: 'noop' }
        ]);
    }
    
    const session = getUserSession(chatId);
    if (session.data.categoryId) {
        keyboard.inline_keyboard.push([
            { text: '🔙 Kembali ke Produk', callback_data: `cat_${session.data.categoryId}` }
        ]);
    }
    
    keyboard.inline_keyboard.push(
        [{ text: '🛍️ Lihat Katalog', callback_data: 'menu_catalog' }],
        [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    );
    
    const options = {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    };
    
    if (messageId) {
        await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            ...options
        });
    } else {
        if (product.image_url) {
            try {
                await bot.sendPhoto(chatId, product.image_url, {
                    caption: message,
                    ...options
                });
            } catch (err) {
                await bot.sendMessage(chatId, message, options);
            }
        } else {
            await bot.sendMessage(chatId, message, options);
        }
    }
    
    updateUserSession(chatId, {
        state: 'product_detail',
        data: { product }
    });
}

// Handle buy action
async function handleBuyAction(chatId, productId) {
    const product = await botController.getProductById(productId);
    
    if (!product || product.stock <= 0) {
        await bot.sendMessage(chatId, '❌ Produk tidak tersedia atau stok habis.');
        return;
    }
    
    updateUserSession(chatId, {
        state: 'checkout',
        data: { product }
    });
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '❌ Batal', callback_data: `prod_${productId}` }]
        ]
    };
    
    await bot.sendMessage(chatId, 
        '📧 *CHECKOUT*\n\n' +
        'Silakan balas dengan email Anda untuk menerima invoice dan link download.\n\n' +
        '💡 Contoh: email@example.com',
        {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }
    );
}

// Create order and generate QRIS
async function createOrder(product, customerEmail, customerTelegram) {
    const db = getDB();
    
    try {
        const settings = await new Promise((resolve, reject) => {
            const { getSettings } = require('./database');
            getSettings((err, settings) => {
                if (err) reject(err);
                else resolve(settings);
            });
        });
        
        const invoiceNumber = generateInvoiceNumber();
        const uniqueCode = generateUniqueCode();
        const totalAmount = product.price + uniqueCode;
        
        // Generate QRIS string
        let qrisString = '';
        try {
            const qrisResponse = await axios.post(`${QRIS_SERVICE_URL}/generate-qris`, {
                base_string: settings.qris_base_string,
                amount: totalAmount
            });
            qrisString = qrisResponse.data.qris_string;
        } catch (qrisError) {
            logger.error('QRIS generation error', { error: qrisError.message });
            qrisString = settings.qris_base_string;
        }
        
        // Create order in database
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO orders (invoice_number, product_id, product_name, product_price, unique_code, total_amount, 
                 customer_email, customer_telegram, qris_string, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [invoiceNumber, product.id, product.name, product.price, uniqueCode, totalAmount, 
                 customerEmail || null, customerTelegram || null, qrisString],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        db.close();
        
        return {
            invoice_number: invoiceNumber,
            product_name: product.name,
            product_price: product.price,
            unique_code: uniqueCode,
            total_amount: totalAmount,
            qris_string: qrisString
        };
        
    } catch (error) {
        db.close();
        throw error;
    }
}

// Handle checkout with email
async function handleCheckout(chatId, email, username) {
    const session = getUserSession(chatId);
    const product = session.data.product;
    
    if (!product) {
        await bot.sendMessage(chatId, '❌ Sesi checkout kedaluwarsa. Silakan mulai lagi dari menu.');
        await showMainMenu(chatId);
        return;
    }
    
    // Simple email validation
    if (!email.includes('@') || !email.includes('.')) {
        await bot.sendMessage(chatId, '❌ Format email tidak valid. Silakan coba lagi:');
        return;
    }
    
    try {
        await bot.sendMessage(chatId, '⏳ Memproses pesanan Anda...');
        
        // Create order and generate QRIS
        const order = await createOrder(product, email, username);
        
        // Generate QRIS as image buffer
        const qrBuffer = await qrcode.toBuffer(order.qris_string, {
            errorCorrectionLevel: 'M',
            type: 'png',
            width: 400,
            margin: 2
        });
        
        // Escape markdown special characters
        const escapeMarkdown = (text) => {
            return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
        };
        
        // Send invoice message (NO parse_mode untuk avoid formatting errors)
        let invoiceMsg = `✅ PESANAN DIBUAT\n\n`;
        invoiceMsg += `🧾 Invoice: ${order.invoice_number}\n`;
        invoiceMsg += `📦 Produk: ${order.product_name}\n`;
        invoiceMsg += `💵 Harga: ${botController.formatCurrency(order.product_price)}\n`;
        invoiceMsg += `🔢 Kode Unik: ${botController.formatCurrency(order.unique_code)}\n`;
        invoiceMsg += `💰 TOTAL BAYAR: ${botController.formatCurrency(order.total_amount)}\n\n`;
        invoiceMsg += `📱 CARA PEMBAYARAN:\n`;
        invoiceMsg += `1. Scan QR Code di bawah dengan app e-wallet\n`;
        invoiceMsg += `2. Pastikan nominal: ${botController.formatCurrency(order.total_amount)}\n`;
        invoiceMsg += `3. Selesaikan pembayaran\n`;
        invoiceMsg += `4. Invoice akan dikirim ke email Anda\n\n`;
        invoiceMsg += `⏰ Bayar dalam 1 jam atau pesanan dibatalkan otomatis.\n\n`;
        invoiceMsg += `💡 Simpan nomor invoice untuk tracking!`;
        
        const keyboard = {
            inline_keyboard: [
                [{ text: '📦 Cek Status Pesanan', callback_data: 'menu_check_order' }],
                [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
            ]
        };
        
        await bot.sendMessage(chatId, invoiceMsg, {
            reply_markup: keyboard
        });
        
        // Send QRIS image
        await bot.sendPhoto(chatId, qrBuffer, {
            caption: `QR Code Pembayaran - ${order.invoice_number}\n\n💰 Total: ${botController.formatCurrency(order.total_amount)}`
        });
        
        updateUserSession(chatId, { state: 'menu', data: {} });
        
        logger.info('Order created via Telegram', { invoice: order.invoice_number, chatId });
        
    } catch (error) {
        logger.error('Error creating order from Telegram', { error: error.message });
        await bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi atau hubungi admin.');
    }
}

// Handle check order
async function handleCheckOrder(chatId) {
    updateUserSession(chatId, { state: 'check_order', data: {} });
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '❌ Batal', callback_data: 'menu_main' }]
        ]
    };
    
    await bot.sendMessage(chatId,
        '🔍 *CEK PESANAN*\n\n' +
        'Silakan balas dengan nomor invoice Anda.\n\n' +
        '💡 Contoh: INV-20250108-001',
        {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }
    );
}

// Show order status
async function showOrderStatus(chatId, invoiceNumber) {
    const order = await botController.checkOrderStatus(invoiceNumber);
    
    if (!order) {
        const keyboard = {
            inline_keyboard: [
                [{ text: '🔄 Coba Lagi', callback_data: 'menu_check_order' }],
                [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
            ]
        };
        
        await bot.sendMessage(chatId, 
            '❌ Pesanan tidak ditemukan. Pastikan nomor invoice benar.',
            { reply_markup: keyboard }
        );
        return;
    }
    
    const orderMsg = botController.formatOrderMessage(order);
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '🔄 Cek Pesanan Lain', callback_data: 'menu_check_order' }],
            [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
    };
    
    await bot.sendMessage(chatId, orderMsg, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
    
    updateUserSession(chatId, { state: 'menu', data: {} });
}

// Handle search
async function handleSearch(chatId) {
    updateUserSession(chatId, { state: 'search', data: {} });
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '❌ Batal', callback_data: 'menu_main' }]
        ]
    };
    
    await bot.sendMessage(chatId,
        '🔍 *CARI PRODUK*\n\n' +
        'Ketik nama produk yang Anda cari (minimal 3 karakter).',
        {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }
    );
}

// Show search results
async function showSearchResults(chatId, query) {
    if (query.length < 3) {
        await bot.sendMessage(chatId, '❌ Masukkan minimal 3 karakter untuk pencarian.');
        return;
    }
    
    const products = await botController.searchProducts(query);
    
    if (products.length === 0) {
        const keyboard = {
            inline_keyboard: [
                [{ text: '🔄 Cari Lagi', callback_data: 'menu_search' }],
                [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
            ]
        };
        
        await bot.sendMessage(chatId, 
            `❌ Tidak ada produk yang cocok dengan "${query}".`,
            { reply_markup: keyboard }
        );
        return;
    }
    
    const keyboard = {
        inline_keyboard: products.map(product => [
            { 
                text: `${product.name} - ${botController.formatCurrency(product.price)}`, 
                callback_data: `prod_${product.id}` 
            }
        ])
    };
    
    keyboard.inline_keyboard.push(
        [{ text: '🔄 Cari Lagi', callback_data: 'menu_search' }],
        [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    );
    
    const message = `🔍 *HASIL PENCARIAN "${query}"*\n\nDitemukan ${products.length} produk:`;
    
    await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
    
    updateUserSession(chatId, {
        state: 'product_list',
        data: { products }
    });
}

// Show help
async function showHelp(chatId, messageId = null) {
    const helpMsg = await botController.getHelpMessage();
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
    };
    
    const options = {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    };
    
    if (messageId) {
        await bot.editMessageText(helpMsg, {
            chat_id: chatId,
            message_id: messageId,
            ...options
        });
    } else {
        await bot.sendMessage(chatId, helpMsg, options);
    }
}

// Start Telegram bot
async function startTelegramBot() {
    try {
        const settings = await getBotToken();
        
        if (!settings || !settings.telegram_bot_token) {
            logger.warn('Telegram bot token not configured');
            return;
        }
        
        if (settings.telegram_bot_enabled !== 1) {
            logger.info('Telegram bot is disabled in settings');
            return;
        }
        
        bot = new TelegramBot(settings.telegram_bot_token, {
            polling: {
                interval: 300,
                autoStart: true,
                params: {
                    timeout: 10
                }
            }
        });
        
        logger.info('Telegram bot started successfully');
        
        // Handle /start command
        bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            updateUserSession(chatId, { state: 'menu', data: {} });
            await showMainMenu(chatId);
        });
        
        // Handle callback queries (button clicks)
        bot.on('callback_query', async (query) => {
            try {
                const chatId = query.message.chat.id;
                const messageId = query.message.message_id;
                const data = query.data || query.callback_data; // Support both formats
                
                logger.info('Callback query received', { 
                    chatId, 
                    data, 
                    hasCallbackData: !!query.callback_data,
                    hasData: !!query.data 
                });
                
                if (!data) {
                    logger.warn('Callback query without data', { queryKeys: Object.keys(query) });
                    await bot.answerCallbackQuery(query.id);
                    return;
                }
                
                // Answer callback to remove loading state
                await bot.answerCallbackQuery(query.id);
                
                // Handle different callbacks
                if (data === 'menu_main') {
                await showMainMenu(chatId, messageId);
            } else if (data === 'menu_catalog') {
                await showCategories(chatId, messageId);
            } else if (data === 'menu_search') {
                await handleSearch(chatId);
            } else if (data === 'menu_check_order') {
                await handleCheckOrder(chatId);
            } else if (data === 'menu_help') {
                await showHelp(chatId, messageId);
            } else if (data.startsWith('cat_')) {
                const categoryId = parseInt(data.replace('cat_', ''));
                await showProducts(chatId, categoryId, messageId);
            } else if (data.startsWith('prod_')) {
                const productId = data.replace('prod_', '');
                await showProductDetail(chatId, productId, messageId);
            } else if (data.startsWith('buy_')) {
                const productId = data.replace('buy_', '');
                await handleBuyAction(chatId, productId);
            } else if (data === 'noop') {
                // Do nothing
            }
            } catch (error) {
                logger.error('Error handling callback query', { error: error.message, query });
                try {
                    await bot.answerCallbackQuery(query.id, { text: 'Terjadi kesalahan, silakan coba lagi.' });
                } catch (e) {
                    // Ignore
                }
            }
        });
        
        // Handle text messages
        bot.on('message', async (msg) => {
            if (msg.text && !msg.text.startsWith('/')) {
                const chatId = msg.chat.id;
                const text = msg.text.trim();
                const session = getUserSession(chatId);
                
                switch (session.state) {
                    case 'checkout':
                        await handleCheckout(chatId, text, msg.from.username);
                        break;
                        
                    case 'check_order':
                        await showOrderStatus(chatId, text.toUpperCase());
                        break;
                        
                    case 'search':
                        await showSearchResults(chatId, text);
                        break;
                        
                    default:
                        // Ignore or show menu
                        if (text.toLowerCase() === 'menu') {
                            await showMainMenu(chatId);
                        }
                }
            }
        });
        
        // Handle errors
        bot.on('polling_error', (error) => {
            logger.error('Telegram polling error', { error: error.message });
        });
        
    } catch (error) {
        logger.error('Error starting Telegram bot', { error: error.message });
    }
}

// Stop bot
async function stopTelegramBot() {
    if (bot) {
        await bot.stopPolling();
        bot = null;
        logger.info('Telegram bot stopped');
    }
}

module.exports = {
    startTelegramBot,
    stopTelegramBot,
    getBotToken
};

// Start bot if run directly
if (require.main === module) {
    logger.info('Starting Telegram bot...');
    
    // Wait for database to be ready
    setTimeout(() => {
        startTelegramBot().catch(err => {
            logger.error('Failed to start Telegram bot', { error: err.message });
            // Retry after 5 seconds
            setTimeout(() => {
                startTelegramBot().catch(console.error);
            }, 5000);
        });
    }, 2000); // Wait 2 seconds for database
}
