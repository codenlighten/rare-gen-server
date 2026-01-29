const bsv = require('@smartledger/bsv');

class TransactionBuilder {
  constructor(feeRateSatsPerByte = 0.01) {
    this.feeRate = feeRateSatsPerByte;
  }

  /**
   * Build a split transaction (1000 × 50-sat UTXOs + change)
   * Assumes funding address is same as change address
   */
  buildSplitTx(fundingUTXO, fundingPrivateKey, changeAddress, poolSize = 1000, poolValue = 50) {
    const tx = new bsv.Transaction();

    // Add input
    tx.from({
      txid: fundingUTXO.tx_hash ?? fundingUTXO.txid,
      outputIndex: fundingUTXO.tx_pos ?? fundingUTXO.vout,
      script: bsv.Script.fromHex(fundingUTXO.scriptPubKey),
      satoshis: fundingUTXO.value ?? fundingUTXO.satoshis,
    });

    // Add pool outputs
    for (let i = 0; i < poolSize; i++) {
      tx.to(changeAddress, poolValue);
    }

    // Estimate fees
    const estTxSize = this._estimateTxSize(tx, 1, poolSize + 1); // 1 input, poolSize + change output
    const estFee = Math.ceil(estTxSize * this.feeRate);

    // Calculate change
    const inputTotal = fundingUTXO.value || fundingUTXO.satoshis;
    const outputTotal = poolSize * poolValue;
    const change = inputTotal - outputTotal - estFee;

    if (change < 0) {
      throw new Error(
        `Insufficient funds: input=${inputTotal}, required=${outputTotal + estFee}, deficit=${Math.abs(change)}`
      );
    }

    // Add change output (allow small change outputs)
    if (change > 0) {
      tx.to(changeAddress, change);
    }

    // Sign
    tx.sign(bsv.PrivateKey.fromWIF(fundingPrivateKey));

    return {
      tx,
      txHex: tx.toString('hex'),
      txSize: tx.size || this._estimateTxSize(tx, 1, poolSize + (change > 0 ? 1 : 0)),
      fee: estFee,
      change: Math.max(0, change),
    };
  }

  /**
   * Build a hash publish transaction
   * Input: pool UTXO
   * Outputs: OP_RETURN hash + change
   */
  buildPublishTx(poolUTXO, hash, fundingPrivateKey, changeAddress, returnChange = true) {
    const utxoSatoshis = Number(poolUTXO.satoshis);
    if (!Number.isFinite(utxoSatoshis)) {
      throw new Error(`Invalid UTXO satoshis: ${poolUTXO.satoshis}`);
    }

    // Build transaction using proven method
    const tx = new bsv.Transaction()
      .from({
        txid: poolUTXO.txid,
        outputIndex: poolUTXO.vout,
        script: bsv.Script.fromHex(poolUTXO.script_pub_key),
        satoshis: utxoSatoshis,
      })
      .addOutput(new bsv.Transaction.Output({
        script: bsv.Script.buildSafeDataOut(Buffer.from(hash, 'hex')),
        satoshis: 0,
      }))
      .change(changeAddress)
      .feePerKb(this.feeRate * 1000) // Convert sat/byte to sat/KB
      .sign(bsv.PrivateKey.fromWIF(fundingPrivateKey));

    return {
      tx,
      txHex: tx.toString('hex'),
      txSize: tx.size || tx._estimateSize(),
      fee: tx._estimateFee(),
      change: returnChange ? tx.outputs[tx.outputs.length - 1].satoshis : 0,
    };
  }

  /**
   * Build a simple P2PKH transfer (for testing)
   */
  buildTransferTx(inputUTXO, toAddress, amount, fundingPrivateKey, changeAddress) {
    const tx = new bsv.Transaction();

    // Add input
    tx.from({
      txid: inputUTXO.tx_hash || inputUTXO.txid,
      outputIndex: inputUTXO.tx_pos || inputUTXO.vout,
      script: bsv.Script.fromHex(inputUTXO.scriptPubKey || inputUTXO.script_pub_key),
      satoshis: inputUTXO.value || inputUTXO.satoshis,
    });

    // Add output
    tx.to(toAddress, amount);

    // Estimate fee
    const estTxSize = this._estimateTxSize(tx, 1, 2); // 1 input, output + change
    const estFee = Math.ceil(estTxSize * this.feeRate);

    // Calculate change
    const inputTotal = inputUTXO.value || inputUTXO.satoshis;
    const change = inputTotal - amount - estFee;

    if (change < 0) {
      throw new Error(
        `Insufficient funds: input=${inputTotal}, output=${amount}, fee=${estFee}`
      );
    }

    // Add change
    if (change > 0) {
      tx.to(changeAddress, change);
    }

    // Sign
    tx.sign(bsv.PrivateKey.fromWIF(fundingPrivateKey));

    return {
      tx,
      txHex: tx.toString('hex'),
      txSize: tx.size || this._estimateTxSize(tx, 1, 2),
      fee: estFee,
      change,
    };
  }

  /**
   * Estimate transaction size
   * P2PKH: ~226 bytes per input, ~34 bytes per output
   */
  _estimateTxSize(tx, inputs, outputs) {
    // Rough estimate: overhead + inputs + outputs
    return 10 + (inputs * 226) + (outputs * 34);
  }
}

module.exports = TransactionBuilder;
