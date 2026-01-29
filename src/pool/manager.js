const { getPool } = require('../db/connection');

class UTXOPoolManager {
  /**
   * Insert a new UTXO into the pool
   */
  static async insertUTXO(txid, vout, satoshis, scriptPubKey, address, purpose = 'publish_pool') {
    const pool = getPool();
    
    try {
      const result = await pool.query(
        `INSERT INTO utxos (txid, vout, satoshis, script_pub_key, address, purpose, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'available')
         ON CONFLICT (txid, vout) DO UPDATE SET status = 'available'
         RETURNING id, txid, vout, satoshis, status`,
        [txid, vout, satoshis, scriptPubKey, address, purpose]
      );
      
      return result.rows[0];
    } catch (err) {
      throw new Error(`Failed to insert UTXO: ${err.message}`);
    }
  }

  /**
   * Insert multiple UTXOs (for split tx)
   */
  static async insertBatch(utxos) {
    const pool = getPool();
    
    try {
      const results = [];
      
      for (const utxo of utxos) {
        const result = await this.insertUTXO(
          utxo.txid,
          utxo.vout,
          utxo.satoshis,
          utxo.scriptPubKey,
          utxo.address,
          utxo.purpose || 'publish_pool'
        );
        results.push(result);
      }
      
      return results;
    } catch (err) {
      throw new Error(`Failed to insert batch: ${err.message}`);
    }
  }

  /**
   * Reserve an available UTXO (atomic operation)
   */
  static async reserveUTXO(purpose = 'publish_pool') {
    const pool = getPool();
    
    try {
      const result = await pool.query(
        `UPDATE utxos
         SET status = 'reserved', reserved_at = NOW()
         WHERE id = (
           SELECT id FROM utxos
           WHERE purpose = $1 AND status = 'available'
           ORDER BY created_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, txid, vout, satoshis, script_pub_key, address`,
        [purpose]
      );
      
      return result.rows[0] || null;
    } catch (err) {
      throw new Error(`Failed to reserve UTXO: ${err.message}`);
    }
  }

  /**
   * Mark a UTXO as spent
   */
  static async markSpent(utxoId, publishTxid = null) {
    const pool = getPool();
    
    try {
      const result = await pool.query(
        `UPDATE utxos
         SET status = 'spent', spent_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING id, txid, vout, status`,
        [utxoId]
      );
      
      return result.rows[0];
    } catch (err) {
      throw new Error(`Failed to mark UTXO spent: ${err.message}`);
    }
  }

  /**
   * Get available UTXO count by purpose
   */
  static async getAvailableCount(purpose = 'publish_pool') {
    const pool = getPool();
    
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM utxos
         WHERE purpose = $1 AND status = 'available'`,
        [purpose]
      );
      
      return parseInt(result.rows[0].count, 10);
    } catch (err) {
      throw new Error(`Failed to get available count: ${err.message}`);
    }
  }

  /**
   * Get pool statistics
   */
  static async getPoolStats() {
    const pool = getPool();
    
    try {
      const result = await pool.query(
        `SELECT 
          purpose,
          status,
          COUNT(*) as count,
          SUM(satoshis) as total_satoshis
         FROM utxos
         GROUP BY purpose, status
         ORDER BY purpose, status`
      );
      
      return result.rows;
    } catch (err) {
      throw new Error(`Failed to get pool stats: ${err.message}`);
    }
  }

  /**
   * Get all spent UTXOs (for auditing)
   */
  static async getSpentUTXOs(limit = 100, offset = 0) {
    const pool = getPool();
    
    try {
      const result = await pool.query(
        `SELECT id, txid, vout, satoshis, address, spent_at
         FROM utxos
         WHERE status = 'spent'
         ORDER BY spent_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      return result.rows;
    } catch (err) {
      throw new Error(`Failed to get spent UTXOs: ${err.message}`);
    }
  }

  /**
   * Release reserved UTXO back to available (for retries)
   */
  static async releaseReserved(utxoId) {
    const pool = getPool();
    
    try {
      const result = await pool.query(
        `UPDATE utxos
         SET status = 'available', reserved_at = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'reserved'
         RETURNING id, txid, vout, status`,
        [utxoId]
      );
      
      return result.rows[0];
    } catch (err) {
      throw new Error(`Failed to release UTXO: ${err.message}`);
    }
  }
}

module.exports = UTXOPoolManager;
