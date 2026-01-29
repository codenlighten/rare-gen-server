#!/usr/bin/env node

/**
 * Main entry point - runs both HTTP API and RabbitMQ consumer
 */

require('dotenv').config();

const { initDb } = require('./db/connection');
const { runMigrations } = require('./db/migrations');
const app = require('./api/server');
const RabbitConsumer = require('./rabbit/consumer');

const PORT = process.env.PORT || 3000;
const ENABLE_RABBIT = process.env.ENABLE_RABBIT !== 'false';

async function start() {
  try {
    console.log('========================================');
    console.log('AKUA Publisher Service');
    console.log('========================================\n');

    // 1. Initialize database
    console.log('[Init] Connecting to database...');
    await initDb();
    await runMigrations();
    console.log('[Init] ✓ Database ready\n');

    // 2. Start HTTP API
    console.log(`[Init] Starting HTTP API on port ${PORT}...`);
    const server = app.listen(PORT, () => {
      console.log(`[Init] ✓ HTTP API listening on http://localhost:${PORT}`);
      console.log(`[Init]   Health: http://localhost:${PORT}/health`);
      console.log(`[Init]   Metrics: http://localhost:${PORT}/metrics`);
      console.log(`[Init]   Pool: http://localhost:${PORT}/api/pool/status\n`);
    });

    // 3. Start RabbitMQ consumer (if enabled)
    if (ENABLE_RABBIT && process.env.RABBIT_URL) {
      console.log('[Init] Starting RabbitMQ consumer...');
      
      const consumer = new RabbitConsumer({
        rabbitUrl: process.env.RABBIT_URL,
        inQueue: process.env.IN_QUEUE || 'akua.geo.ingest',
        outQueue: process.env.OUT_QUEUE || 'akua.geo.published',
        dlqQueue: process.env.DLQ_QUEUE || 'akua.geo.dlq',
        prefetch: process.env.PREFETCH || 1,
        maxRetries: process.env.MAX_RETRIES || 10,
        explorerUrl: process.env.EXPLORER_BASE,
        fundingWIF: process.env.FUNDING_WIF,
        changeAddress: process.env.CHANGE_ADDRESS,
        feeRate: process.env.FEE_RATE_SAT_PER_BYTE || 0.01,
      });

      await consumer.start();
      global.rabbitConsumer = consumer;
      console.log('[Init] ✓ RabbitMQ consumer started\n');
    } else {
      console.log('[Init] ⊘ RabbitMQ consumer disabled (ENABLE_RABBIT=false or RABBIT_URL not set)\n');
    }

    console.log('========================================');
    console.log('✓ AKUA Publisher Service Ready');
    console.log('========================================\n');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('\n[Shutdown] Received SIGTERM, shutting down gracefully...');
      
      if (global.rabbitConsumer) {
        await global.rabbitConsumer.stop();
      }
      
      server.close(() => {
        console.log('[Shutdown] ✓ HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('\n[Shutdown] Received SIGINT, shutting down gracefully...');
      
      if (global.rabbitConsumer) {
        await global.rabbitConsumer.stop();
      }
      
      server.close(() => {
        console.log('[Shutdown] ✓ HTTP server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('[Init] ✗ Startup failed:', error.message);
    process.exit(1);
  }
}

start();
