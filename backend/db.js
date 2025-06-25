const { createClient } = require('@libsql/client');
require('dotenv').config();

const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initializeDatabase() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS city_votes (
                city_id TEXT PRIMARY KEY,
                likes INTEGER DEFAULT 0,
                dislikes INTEGER DEFAULT 0,
                dont_know INTEGER DEFAULT 0
            );
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                city_id TEXT NOT NULL,
                vote_type TEXT NOT NULL,
                UNIQUE(user_id, city_id)
            );
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT UNIQUE NOT NULL,
                user_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Create index for faster lookups
        await db.execute(`
            CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
        `);
        
        await db.execute(`
            CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
        `);
        
        // Clean up any debug data (as mentioned in requirements)
        try {
            await db.execute(`
                DELETE FROM users WHERE telegram_id LIKE 'debug-telegram-id%';
            `);
            console.log("Cleaned up debug telegram ID entries.");
        } catch (error) {
            // Ignore errors if no debug entries exist
            console.log("No debug entries to clean up.");
        }
        
        console.log("Database initialized successfully.");
    } catch (error) {
        console.error("Error initializing database:", error);
        // We should exit if we can't connect to the DB
        process.exit(1);
    }
}

module.exports = { db, initializeDatabase }; 