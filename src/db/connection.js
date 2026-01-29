const { Pool } = require('pg');

let pool;

async function initDb() {
  pool = new Pool({
    connectionString: process.env.PG_URL,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });

  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✓ Database connected:', res.rows[0]);
  } catch (err) {
    console.error('✗ Database connection failed:', err.message);
    throw err;
  }

  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return pool;
}

async function closeDb() {
  if (pool) {
    await pool.end();
  }
}

module.exports = {
  initDb,
  getPool,
  closeDb,
};
