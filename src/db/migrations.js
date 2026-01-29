const fs = require('fs');
const path = require('path');
const { getPool } = require('./connection');

async function runMigrations() {
  const pool = getPool();
  const migrationsDir = path.join(__dirname, '../../migrations');

  // Create migrations tracking table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Get list of migration files
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT id FROM schema_migrations WHERE name = $1',
      [file]
    );

    if (rows.length === 0) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      
      try {
        await pool.query(sql);
        await pool.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [file]
        );
        console.log(`✓ ${file} applied`);
      } catch (err) {
        console.error(`✗ Migration ${file} failed:`, err.message);
        throw err;
      }
    } else {
      console.log(`⊘ ${file} already applied`);
    }
  }

  console.log('✓ All migrations completed');
}

module.exports = { runMigrations };
