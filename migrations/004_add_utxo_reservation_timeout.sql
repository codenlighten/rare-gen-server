-- Migration 004: Add UTXO reservation timeout and status tracking
-- Enables automatic UTXO recovery if worker crashes

-- Add reserved_until column for timeout-based release
ALTER TABLE utxos ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMP;

-- Add dirty flag for mempool conflict handling
ALTER TABLE utxos ADD COLUMN IF NOT EXISTS dirty BOOLEAN DEFAULT FALSE;

-- Add spent_by_txid for tracking
ALTER TABLE utxos ADD COLUMN IF NOT EXISTS spent_by_txid VARCHAR(64);

-- Update trigger for updated_at on utxos
DROP TRIGGER IF EXISTS update_utxos_updated_at ON utxos;
CREATE TRIGGER update_utxos_updated_at
    BEFORE UPDATE ON utxos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at column if missing
ALTER TABLE utxos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Index for expired reservation cleanup
CREATE INDEX IF NOT EXISTS idx_utxos_reserved_until 
ON utxos(reserved_until) 
WHERE status = 'reserved' AND reserved_until IS NOT NULL;

-- Index for dirty UTXO identification
CREATE INDEX IF NOT EXISTS idx_utxos_dirty 
ON utxos(dirty) 
WHERE dirty = TRUE;

-- Verify
\d utxos
