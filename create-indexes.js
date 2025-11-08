/**
 * Database Indexes Creation Script
 * Run this once to add performance indexes
 */

const { getDB } = require('./database');
const logger = require('./logger');

const indexes = [
    {
        name: 'idx_orders_status',
        table: 'orders',
        sql: 'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)'
    },
    {
        name: 'idx_orders_total_amount',
        table: 'orders',
        sql: 'CREATE INDEX IF NOT EXISTS idx_orders_total_amount ON orders(total_amount)'
    },
    {
        name: 'idx_orders_created_at',
        table: 'orders',
        sql: 'CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)'
    },
    {
        name: 'idx_products_slug',
        table: 'products',
        sql: 'CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug)'
    },
    {
        name: 'idx_products_is_active',
        table: 'products',
        sql: 'CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active)'
    },
    {
        name: 'idx_posts_slug',
        table: 'posts',
        sql: 'CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug)'
    },
    {
        name: 'idx_posts_status',
        table: 'posts',
        sql: 'CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)'
    },
    {
        name: 'idx_posts_published_at',
        table: 'posts',
        sql: 'CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at)'
    },
    {
        name: 'idx_download_tokens_token',
        table: 'download_tokens',
        sql: 'CREATE INDEX IF NOT EXISTS idx_download_tokens_token ON download_tokens(token)'
    },
    {
        name: 'idx_download_tokens_expires_at',
        table: 'download_tokens',
        sql: 'CREATE INDEX IF NOT EXISTS idx_download_tokens_expires_at ON download_tokens(expires_at)'
    }
];

async function createIndexes() {
    const db = getDB();
    
    logger.info('Starting database index creation...');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const index of indexes) {
        try {
            await new Promise((resolve, reject) => {
                db.run(index.sql, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            
            logger.info(`✓ Created index: ${index.name} on ${index.table}`);
            successCount++;
        } catch (err) {
            logger.error(`✗ Failed to create index: ${index.name}`, { error: err.message });
            errorCount++;
        }
    }
    
    db.close();
    
    logger.info('========================================');
    logger.info(`Index creation completed:`);
    logger.info(`  Success: ${successCount}`);
    logger.info(`  Errors: ${errorCount}`);
    logger.info('========================================');
    
    if (errorCount > 0) {
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    createIndexes()
        .then(() => {
            logger.info('Done!');
            process.exit(0);
        })
        .catch((err) => {
            logger.error('Fatal error creating indexes', { error: err.message, stack: err.stack });
            process.exit(1);
        });
}

module.exports = { createIndexes };
