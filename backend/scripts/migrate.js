const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// No-op placeholder removed

async function main() {
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    try {
        // Ensure migrations table exists
        await db.execute(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const migrationsDir = path.join(__dirname, '..', 'migrations');
        if (!fs.existsSync(migrationsDir)) {
            console.log('No migrations directory found. Nothing to do.');
            process.exit(0);
        }

        const files = fs
            .readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort();

        // Load applied migrations
        const appliedRes = await db.execute('SELECT name FROM schema_migrations');
        const applied = new Set(appliedRes.rows.map((r) => r.name));

        const pending = files.filter((f) => !applied.has(f));
        if (pending.length === 0) {
            console.log('No pending migrations.');
            process.exit(0);
        }

        for (const file of pending) {
            const full = path.join(migrationsDir, file);
            const sql = fs.readFileSync(full, 'utf8').trim();
            if (!sql) continue;

            console.log(`Applying migration: ${file}`);
            await db.transaction(async (tx) => {
                // Execute statements in order (simple splitter on ;) to be safe
                const statements = sql
                    .split(/;\s*\n|;\s*$/gm)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                for (const stmt of statements) {
                    await tx.execute(stmt);
                }
                await tx.execute('INSERT INTO schema_migrations(name) VALUES(?)', [file]);
            });
            console.log(`Applied: ${file}`);
        }

        console.log('Migrations complete.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message || err);
        process.exit(1);
    } finally {
        try { await db.close(); } catch (_) {}
    }
}

main();


