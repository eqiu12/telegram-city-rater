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
        // Airports aggregate votes
        await db.execute(`
            CREATE TABLE IF NOT EXISTS airport_votes (
                airport_id TEXT PRIMARY KEY,
                likes INTEGER DEFAULT 0,
                dislikes INTEGER DEFAULT 0,
                dont_know INTEGER DEFAULT 0
            );
        `);
        // Per-user airport votes
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_airport_votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                airport_id TEXT NOT NULL,
                vote_type TEXT NOT NULL,
                UNIQUE(user_id, airport_id)
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

        // Enforce unique non-null user_id values in users (allow multiple NULLs)
        await db.execute(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_id_unique_nonnull
            ON users(user_id) WHERE user_id IS NOT NULL;
        `);

        // Enforce vote_type values at DB level using triggers (cities)
        await db.execute(`
            CREATE TRIGGER IF NOT EXISTS trg_user_votes_vote_type_insert
            BEFORE INSERT ON user_votes
            FOR EACH ROW
            BEGIN
                SELECT CASE WHEN NEW.vote_type NOT IN ('liked','disliked','dont_know')
                           THEN RAISE(ABORT, 'Invalid vote_type') END;
            END;
        `);
        await db.execute(`
            CREATE TRIGGER IF NOT EXISTS trg_user_votes_vote_type_update
            BEFORE UPDATE OF vote_type ON user_votes
            FOR EACH ROW
            BEGIN
                SELECT CASE WHEN NEW.vote_type NOT IN ('liked','disliked','dont_know')
                           THEN RAISE(ABORT, 'Invalid vote_type') END;
            END;
        `);
        // Enforce vote_type values for airports
        await db.execute(`
            CREATE TRIGGER IF NOT EXISTS trg_user_airport_votes_vote_type_insert
            BEFORE INSERT ON user_airport_votes
            FOR EACH ROW
            BEGIN
                SELECT CASE WHEN NEW.vote_type NOT IN ('liked','disliked','dont_know')
                           THEN RAISE(ABORT, 'Invalid vote_type') END;
            END;
        `);
        await db.execute(`
            CREATE TRIGGER IF NOT EXISTS trg_user_airport_votes_vote_type_update
            BEFORE UPDATE OF vote_type ON user_airport_votes
            FOR EACH ROW
            BEGIN
                SELECT CASE WHEN NEW.vote_type NOT IN ('liked','disliked','dont_know')
                           THEN RAISE(ABORT, 'Invalid vote_type') END;
            END;
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