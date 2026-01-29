/**
 * PostgreSQL connection and initialization
 */

import { Pool, PoolClient } from "pg";

let pool: Pool | null = null;

export async function initDb(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const databaseUrl =
    process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/raregen";

  pool = new Pool({
    connectionString: databaseUrl,
  });

  pool.on("error", (err: any) => {
    console.error("Unexpected error on idle client:", err);
  });

  try {
    const res = await pool.query("SELECT NOW()");
    console.log("✓ Database connected:", res.rows[0]);
  } catch (err) {
    console.error("✗ Database connection failed:", err);
    throw err;
  }

  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Run a migration (SQL file)
 */
export async function runMigration(name: string, sql: string): Promise<void> {
  const client = await getPool().connect();
  try {
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Check if already applied
    const { rows } = await client.query("SELECT id FROM schema_migrations WHERE name = $1", [
      name,
    ]);

    if (rows.length > 0) {
      console.log(`⊘ ${name} already applied`);
      return;
    }

    // Apply migration
    console.log(`→ Applying ${name}...`);
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    console.log(`✓ ${name} applied`);
  } finally {
    client.release();
  }
}

/**
 * Helper: insert a registered key
 */
export async function insertRegisteredKey(
  pubkeyHex: string,
  pubkeyHash160?: string,
  policyJson?: Record<string, unknown>
): Promise<{ id: number }> {
  const result = await getPool().query(
    `INSERT INTO registered_keys (pubkey_hex, pubkey_hash160, status, policy_json)
     VALUES ($1, $2, 'active', $3)
     RETURNING id`,
    [pubkeyHex, pubkeyHash160 || null, JSON.stringify(policyJson || {})]
  );
  return result.rows[0];
}

/**
 * Helper: check if nonce is used
 */
export async function isNonceUsed(pubkeyHex: string, nonce: string): Promise<boolean> {
  const result = await getPool().query(
    `SELECT id FROM nonces WHERE pubkey_hex = $1 AND nonce = $2`,
    [pubkeyHex, nonce]
  );
  return result.rows.length > 0;
}

/**
 * Helper: record nonce usage
 */
export async function recordNonce(
  pubkeyHex: string,
  nonce: string,
  recordId: string
): Promise<void> {
  await getPool().query(
    `INSERT INTO nonces (pubkey_hex, nonce, record_id, seen_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT DO NOTHING`,
    [pubkeyHex, nonce, recordId]
  );
}

/**
 * Helper: create publish job
 */
export async function createPublishJob(
  recordId: string,
  recordCanonical: string,
  recordHash: string,
  cdnUrl?: string,
  cdnSha256?: string
): Promise<string> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await getPool().query(
    `INSERT INTO publish_jobs (job_id, record_id, record_canonical, record_hash, cdn_url, cdn_sha256, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued')`,
    [jobId, recordId, recordCanonical, recordHash, cdnUrl || null, cdnSha256 || null]
  );
  return jobId;
}
