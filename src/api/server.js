const express = require('express');
const { getPool } = require('../db/connection');
const UTXOPoolManager = require('../pool/manager');

const app = express();
app.use(express.json());

/**
 * Health check endpoint
 * Verifies: Database, RabbitMQ consumer
 */
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {},
  };

  try {
    // Check database
    const pool = getPool();
    await pool.query('SELECT NOW()');
    health.services.database = 'connected';
  } catch (err) {
    health.status = 'degraded';
    health.services.database = `error: ${err.message}`;
  }

  // Check RabbitMQ (if consumer exists)
  if (global.rabbitConsumer) {
    health.services.rabbitmq = global.rabbitConsumer.isRunning() ? 'connected' : 'disconnected';
    if (!global.rabbitConsumer.isRunning()) {
      health.status = 'degraded';
    }
  } else {
    health.services.rabbitmq = 'disabled';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * Metrics/status endpoint
 * Pool stats, recent publishes, system info
 */
app.get('/metrics', async (req, res) => {
  try {
    const pool = getPool();

    // Pool statistics
    const stats = await UTXOPoolManager.getPoolStats();
    const poolByStatus = {};
    stats.forEach(stat => {
      if (!poolByStatus[stat.status]) {
        poolByStatus[stat.status] = {};
      }
      poolByStatus[stat.status][stat.purpose] = {
        count: parseInt(stat.count, 10),
        total_satoshis: parseInt(stat.total_satoshis, 10),
      };
    });

    // Recent publishes count
    const publishCountResult = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE source = 'rabbitmq') as rabbitmq,
        COUNT(*) FILTER (WHERE source = 'api') as api,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour,
        MAX(created_at) as last_publish
       FROM publishes`
    );

    const publishStats = publishCountResult.rows[0];

    // DLQ count (if available)
    let dlqCount = null;
    try {
      const dlqResult = await pool.query(
        `SELECT COUNT(*) as count FROM rabbit_messages WHERE status = 'dead_lettered'`
      );
      dlqCount = parseInt(dlqResult.rows[0].count, 10);
    } catch (err) {
      // Table might not exist yet
      dlqCount = 'N/A';
    }

    res.json({
      pool: poolByStatus,
      publishes: {
        total: parseInt(publishStats.total, 10),
        rabbitmq: parseInt(publishStats.rabbitmq, 10),
        api: parseInt(publishStats.api, 10),
        last_hour: parseInt(publishStats.last_hour, 10),
        last_publish: publishStats.last_publish,
      },
      dlq: {
        count: dlqCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manual publish endpoint (for testing/fallback)
 */
app.post('/api/publish', async (req, res) => {
  const { sha256, payload } = req.body;

  if (!sha256) {
    return res.status(400).json({ error: 'sha256 required' });
  }

  try {
    const MessageProcessor = require('../rabbit/processor');
    const processor = new MessageProcessor(
      process.env.EXPLORER_BASE,
      process.env.FUNDING_WIF,
      process.env.CHANGE_ADDRESS,
      parseFloat(process.env.FEE_RATE_SAT_PER_BYTE || '0.01')
    );

    const result = await processor.processMessage(
      payload || { manual: true },
      `api-${Date.now()}`
    );

    if (result.success) {
      res.json({
        success: true,
        txid: result.txid,
        sha256: result.sha256,
        duplicate: result.duplicate || false,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Pool status endpoint
 */
app.get('/api/pool/status', async (req, res) => {
  try {
    const availableCount = await UTXOPoolManager.getAvailableCount('publish_pool');
    const stats = await UTXOPoolManager.getPoolStats();

    res.json({
      available: availableCount,
      stats: stats.map(s => ({
        purpose: s.purpose,
        status: s.status,
        count: parseInt(s.count, 10),
        total_satoshis: parseInt(s.total_satoshis, 10),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
