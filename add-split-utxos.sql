-- Add split UTXOs to database
-- Transaction: db4f0319fd497cdd991b4f1f71fb94641927f2834b573e2b8849977863ccb203
-- Outputs: 102 × 100 sats + 1 change

-- First, mark the source UTXO as spent
UPDATE utxos 
SET status = 'spent', spent_at = NOW()
WHERE txid = 'f647a20d3432efde7d539bd7bc4e5975ae3a9453cf8eca4704fee875cc4db95b' 
AND vout = 0;

-- Insert the 102 small UTXOs (100 sats each)
DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 0..101 LOOP
    INSERT INTO utxos (txid, vout, satoshis, script_pub_key, address, purpose, status)
    VALUES (
      'db4f0319fd497cdd991b4f1f71fb94641927f2834b573e2b8849977863ccb203',
      i,
      100,
      '76a9144a9bcd49a929359a006acacae9a9f674c575e18e88ac',
      '17oVeW6QRuvM3tKH6eC6SyhuiUATtVnoCY',
      'publish',
      'available'
    );
  END LOOP;
END $$;

-- Insert the change UTXO (5,816,940 sats)
INSERT INTO utxos (txid, vout, satoshis, script_pub_key, address, purpose, status)
VALUES (
  'db4f0319fd497cdd991b4f1f71fb94641927f2834b573e2b8849977863ccb203',
  102,
  5816940,
  '76a9144a9bcd49a929359a006acacae9a9f674c575e18e88ac',
  '17oVeW6QRuvM3tKH6eC6SyhuiUATtVnoCY',
  'publish',
  'available'
);

-- Verify
SELECT COUNT(*), status FROM utxos GROUP BY status;
SELECT COUNT(*) as small_utxos FROM utxos WHERE satoshis = 100;
SELECT COUNT(*) as large_utxos FROM utxos WHERE satoshis > 1000;
