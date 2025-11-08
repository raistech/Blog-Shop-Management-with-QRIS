const nodemailer = require('nodemailer');
const { formatCurrency, formatDate } = require('./utils');

/**
 * Create email transporter from settings
 */
function createTransporter(settings) {
    if (!settings.smtp_host || !settings.smtp_username || !settings.smtp_password) {
        console.warn('⚠️  SMTP not configured');
        return null;
    }
    
    const port = parseInt(settings.smtp_port) || 587;
    const secure = port === 465;
    
    return nodemailer.createTransport({
        host: settings.smtp_host,
        port: port,
        secure: secure,
        auth: {
            user: settings.smtp_username,
            pass: settings.smtp_password
        }
    });
}

/**
 * Send invoice email with download link
 */
async function sendInvoiceEmail(settings, order, downloadToken) {
    if (settings.smtp_active !== '1') {
        console.log('ℹ️  SMTP not active, skipping email');
        return;
    }
    
    const transporter = createTransporter(settings);
    if (!transporter) {
        console.error('❌ Cannot create email transporter');
        return;
    }
    
    const downloadUrl = `${process.env.YOUR_SERVER_URL || 'http://localhost:33415'}/download/${downloadToken}`;
    const fromName = settings.smtp_from_name || settings.store_name;
    
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .invoice-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
        .invoice-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .invoice-row:last-child { border-bottom: none; }
        .label { font-weight: bold; color: #555; }
        .value { color: #333; }
        .download-btn { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; text-align: center; }
        .download-btn:hover { opacity: 0.9; }
        .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
        .alert { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .success { background: #d4edda; border: 1px solid #28a745; padding: 15px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Pembayaran Berhasil!</h1>
            <p>Terima kasih atas pembelian Anda</p>
        </div>
        
        <div class="content">
            <div class="success">
                <strong>🎉 Selamat!</strong> Pembayaran Anda telah kami terima dan pesanan Anda sedang diproses.
            </div>
            
            <div class="invoice-box">
                <h2 style="margin-top: 0; color: #667eea;">Detail Pesanan</h2>
                
                <div class="invoice-row">
                    <span class="label">Nomor Invoice:</span>
                    <span class="value">${order.invoice_number}</span>
                </div>
                
                <div class="invoice-row">
                    <span class="label">Produk:</span>
                    <span class="value">${order.product_name}</span>
                </div>
                
                <div class="invoice-row">
                    <span class="label">Harga:</span>
                    <span class="value">${formatCurrency(order.product_price)}</span>
                </div>
                
                <div class="invoice-row">
                    <span class="label">Kode Unik:</span>
                    <span class="value">${formatCurrency(order.unique_code)}</span>
                </div>
                
                <div class="invoice-row">
                    <span class="label">Total Dibayar:</span>
                    <span class="value"><strong style="color: #28a745;">${formatCurrency(order.total_amount)}</strong></span>
                </div>
                
                <div class="invoice-row">
                    <span class="label">Tanggal:</span>
                    <span class="value">${formatDate(new Date())}</span>
                </div>
            </div>
            
            <div style="text-align: center;">
                <h3>📥 Download Produk Anda</h3>
                <p>Klik tombol di bawah ini untuk mengunduh produk:</p>
                <a href="${downloadUrl}" class="download-btn">Download Sekarang</a>
                <p style="font-size: 12px; color: #888;">Link download berlaku selama ${settings.token_expiry_minutes || 60} menit</p>
            </div>
            
            <div class="alert">
                <strong>⚠️ Penting:</strong><br>
                • Link download hanya berlaku sekali dan akan kedaluwarsa dalam ${settings.token_expiry_minutes || 60} menit<br>
                • Simpan nomor invoice Anda untuk keperluan support<br>
                • Jika link kedaluwarsa, gunakan halaman recovery dengan nomor invoice ini
            </div>
            
            <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 8px;">
                <h4 style="margin-top: 0;">📞 Butuh Bantuan?</h4>
                <p>Hubungi kami:</p>
                <ul style="list-style: none; padding: 0;">
                    ${settings.store_whatsapp ? `<li>📱 WhatsApp: ${settings.store_whatsapp}</li>` : ''}
                    ${settings.store_email ? `<li>📧 Email: ${settings.store_email}</li>` : ''}
                    ${settings.store_telegram ? `<li>💬 Telegram: ${settings.store_telegram}</li>` : ''}
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p>Email ini dikirim otomatis oleh sistem ${settings.store_name}</p>
            <p>Jangan balas email ini</p>
        </div>
    </div>
</body>
</html>
    `;
    
    try {
        await transporter.sendMail({
            from: `"${fromName}" <${settings.smtp_username}>`,
            to: order.customer_email,
            subject: `✅ Invoice #${order.invoice_number} - Download Link`,
            html: emailHtml
        });
        
        console.log(`✅ Invoice email sent to ${order.customer_email}`);
    } catch (error) {
        console.error('❌ Error sending email:', error.message);
    }
}

/**
 * Send download link recovery email
 */
async function sendDownloadEmail(settings, order, downloadToken) {
    if (settings.smtp_active !== '1') {
        console.log('ℹ️  SMTP not active, skipping email');
        return;
    }
    
    const transporter = createTransporter(settings);
    if (!transporter) {
        console.error('❌ Cannot create email transporter');
        return;
    }
    
    const downloadUrl = `${process.env.YOUR_SERVER_URL || 'http://localhost:33415'}/download/${downloadToken}`;
    const fromName = settings.smtp_from_name || settings.store_name;
    
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .download-btn { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
        .alert { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔑 Link Download Baru</h1>
            <p>Invoice: ${order.invoice_number}</p>
        </div>
        
        <div class="content">
            <p>Halo,</p>
            <p>Anda telah meminta link download baru untuk produk: <strong>${order.product_name}</strong></p>
            
            <div style="text-align: center;">
                <a href="${downloadUrl}" class="download-btn">Download Sekarang</a>
                <p style="font-size: 12px; color: #888;">Link download berlaku selama ${settings.token_expiry_minutes || 60} menit</p>
            </div>
            
            <div class="alert">
                <strong>⚠️ Catatan:</strong><br>
                Link ini hanya berlaku sekali dan akan kedaluwarsa dalam ${settings.token_expiry_minutes || 60} menit. Jika kedaluwarsa, silakan request kembali melalui halaman recovery.
            </div>
        </div>
        
        <div class="footer">
            <p>Email ini dikirim otomatis oleh sistem ${settings.store_name}</p>
        </div>
    </div>
</body>
</html>
    `;
    
    try {
        await transporter.sendMail({
            from: `"${fromName}" <${settings.smtp_username}>`,
            to: order.customer_email,
            subject: `🔑 Download Link - ${order.invoice_number}`,
            html: emailHtml
        });
        
        console.log(`✅ Recovery email sent to ${order.customer_email}`);
    } catch (error) {
        console.error('❌ Error sending email:', error.message);
    }
}

module.exports = {
    sendInvoiceEmail,
    sendDownloadEmail
};
