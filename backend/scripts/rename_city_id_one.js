const { createClient } = require('@libsql/client');
require('dotenv').config();

// Usage:
//   node -r dotenv/config backend/scripts/rename_city_id_one.js OLD_ID NEW_ID
// Example:
//   node -r dotenv/config backend/scripts/rename_city_id_one.js city_ялова_1259 city_yalova

async function main() {
  const [oldId, newId] = process.argv.slice(2);
  if (!oldId || !newId) {
    console.error('Usage: node backend/scripts/rename_city_id_one.js OLD_ID NEW_ID');
    process.exit(1);
  }
  if (oldId === newId) {
    console.log('Old and new IDs are identical. Nothing to do.');
    process.exit(0);
  }

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    await db.transaction(async (tx) => {
      // Merge/rename aggregate row in city_votes
      const oldAgg = await tx.execute({
        sql: 'SELECT likes, dislikes, dont_know FROM city_votes WHERE city_id = ?',
        args: [oldId],
      });

      if (oldAgg.rows.length > 0) {
        const { likes, dislikes, dont_know } = oldAgg.rows[0];

        const newExists = await tx.execute({
          sql: 'SELECT 1 FROM city_votes WHERE city_id = ?',
          args: [newId],
        });

        if (newExists.rows.length > 0) {
          // Merge counts into the newId row, then remove oldId
          await tx.execute({
            sql: 'UPDATE city_votes SET likes = likes + ?, dislikes = dislikes + ?, dont_know = dont_know + ? WHERE city_id = ?',
            args: [likes || 0, dislikes || 0, dont_know || 0, newId],
          });
          await tx.execute({ sql: 'DELETE FROM city_votes WHERE city_id = ?', args: [oldId] });
        } else {
          // Simple primary key change
          await tx.execute({
            sql: 'UPDATE city_votes SET city_id = ? WHERE city_id = ?',
            args: [newId, oldId],
          });
        }
      }

      // Handle potential UNIQUE(user_id, city_id) conflicts in user_votes:
      // First, remove duplicates where the same user already has a row with newId
      await tx.execute({
        sql: `
          DELETE FROM user_votes
           WHERE city_id = ?
             AND EXISTS (
               SELECT 1 FROM user_votes uv2
                WHERE uv2.user_id = user_votes.user_id
                  AND uv2.city_id = ?
             )
        `,
        args: [oldId, newId],
      });

      // Then, update remaining rows to the new city_id
      await tx.execute({
        sql: 'UPDATE user_votes SET city_id = ? WHERE city_id = ?',
        args: [newId, oldId],
      });
    });

    console.log(`Successfully renamed ${oldId} -> ${newId} in database.`);
  } catch (err) {
    console.error('Rename failed:', err?.message || err);
    process.exit(1);
  } finally {
    try { await db.close(); } catch (_) {}
  }
}

main();


