const axios = require('axios');

class ExplorerClient {
  constructor(baseUrl, chain = 'bsv', network = 'main') {
    this.baseUrl = baseUrl;
    this.chain = chain;
    this.network = network;
    this.endpoint = `${baseUrl}/api/${chain}/${network}`;
    this.client = axios.create({
      baseURL: this.endpoint,
      timeout: 30000,
    });
  }

  /**
   * Get balance for an address
   */
  async getBalance(address) {
    try {
      const response = await this.client.get(`/address/${address}/balance`);
      return response.data.data;
    } catch (err) {
      throw new Error(`Failed to get balance for ${address}: ${err.message}`);
    }
  }

  /**
   * Get UTXOs for an address (confirmed only)
   */
  async getUTXOs(address, confirmed = true) {
    try {
      const path = confirmed 
        ? `/address/${address}/utxos/confirmed`
        : `/address/${address}/utxos`;
      
      const response = await this.client.get(path);
      return response.data.data.result || [];
    } catch (err) {
      throw new Error(`Failed to get UTXOs for ${address}: ${err.message}`);
    }
  }

  /**
   * Get address info (validation + scriptPubKey)
   */
  async getAddressInfo(address) {
    try {
      const response = await this.client.get(`/address/${address}/info`);
      return response.data.data;
    } catch (err) {
      throw new Error(`Failed to get address info for ${address}: ${err.message}`);
    }
  }

  /**
   * Broadcast a signed transaction
   */
  async broadcastRawTx(txHex) {
    try {
      const response = await this.client.post(`/tx/broadcast`, {
        txHex,
      });
      
      // Explorer returns txid in data.data.txid or data.data
      const txid = response.data.data?.txid || response.data.data;
      if (!txid) {
        throw new Error('No TXID in broadcast response');
      }
      
      return txid;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      const detail = data ? ` ${JSON.stringify(data)}` : '';
      throw new Error(
        `Failed to broadcast transaction${status ? ` (status ${status})` : ''}: ${err.message}${detail}`
      );
    }
  }

  /**
   * Get transaction details by TXID
   */
  async getTxDetails(txid) {
    try {
      const response = await this.client.get(`/tx/${txid}`);
      return response.data.data;
    } catch (err) {
      throw new Error(`Failed to get transaction ${txid}: ${err.message}`);
    }
  }

  /**
   * Get chain info
   */
  async getChainInfo() {
    try {
      const response = await this.client.get(`/chain/info`);
      return response.data.data;
    } catch (err) {
      throw new Error(`Failed to get chain info: ${err.message}`);
    }
  }
}

module.exports = ExplorerClient;
