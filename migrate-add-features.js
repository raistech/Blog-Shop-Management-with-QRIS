// Migration: Add 'features' column to products table
const { getDB } = require('./database');

console.log('🔧 Running migration: Add features column to products table...');

const db = getDB();

// Check if column exists
db.get("PRAGMA table_info(products)", (err, rows) => {
    if (err) {
        console.error('❌ Error checking table:', err);
        db.close();
        process.exit(1);
    }
});

// Add column
db.run(`ALTER TABLE products ADD COLUMN features TEXT`, (err) => {
    if (err) {
        if (err.message.includes('duplicate column name')) {
            console.log('✅ Column "features" already exists. Skipping migration.');
        } else {
            console.error('❌ Migration failed:', err.message);
            db.close();
            process.exit(1);
        }
    } else {
        console.log('✅ Migration successful! Column "features" added to products table.');
    }
    
    db.close();
    console.log('🎉 Migration complete!');
});
