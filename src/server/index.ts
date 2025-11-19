#!/usr/bin/env node
/**
 * AgentHub - Lean MCP Orchestrator
 * Main entry point
 */

import { config as loadEnv } from 'dotenv';
import { MessageBus } from './core/bus.js';
import { StateCache } from './core/state-cache.js';
import { Coordinator } from './core/coordinator.js';
import { FilesystemWatcher } from './core/watcher.js';
import { ExpertBridge } from './core/expert-bridge.js';
import { ExpertWorker } from './core/expert-worker.js';
import { PersistenceManager } from './core/persistence.js';
import { createMCPServer } from './server.js';
import { createHttpTransport } from './transports/http.js';
import { DEFAULT_CONFIG, type ServerConfig } from './types/models.js';

// Load environment variables
loadEnv();

/**
 * Load configuration from environment
 */
function loadConfig(): ServerConfig {
  const watchRoot = process.env['WATCH_ROOT'];
  const logLevel = process.env['LOG_LEVEL'];

  const config: ServerConfig = {
    ...DEFAULT_CONFIG,
    port: Number.parseInt(process.env['PORT'] ?? '3333', 10),
    host: process.env['HOST'] ?? 'localhost',
    logLevel: logLevel === 'debug' ? 'debug' : 'info',
    ...(watchRoot !== undefined && watchRoot.length > 0 && { watchRoot }),
  };

  // Azure OpenAI configuration (optional)
  const azureEndpoint = process.env['AZURE_OPENAI_ENDPOINT'];
  const apiKey = process.env['AZURE_OPENAI_API_KEY'];
  const azureDeployment = process.env['AZURE_EXPERT_DEPLOYMENT'];

  if (
    azureEndpoint !== undefined &&
    azureEndpoint.length > 0 &&
    azureDeployment !== undefined &&
    azureDeployment.length > 0
  ) {
    config.azureOpenAI = {
      endpoint: azureEndpoint,
      ...(apiKey !== undefined && apiKey.length > 0 && { apiKey }),
      deployment: azureDeployment,
      effort: (process.env['AZURE_EXPERT_EFFORT'] ?? 'high') as 'minimal' | 'medium' | 'high',
      verbosity: (process.env['AZURE_EXPERT_VERBOSITY'] ?? 'low') as 'low' | 'medium' | 'high',
    };
  } else {
    console.warn(
      '[Config] Azure OpenAI expert features are disabled. AZURE_OPENAI_ENDPOINT and AZURE_EXPERT_DEPLOYMENT must be set.',
    );
  }

  // Persistence configuration (optional)
  const persistenceEnabled = process.env['PERSISTENCE_ENABLED'] === 'true';
  if (persistenceEnabled) {
    config.persistence = {
      enabled: true,
      snapshotPath: process.env['PERSISTENCE_PATH'] ?? '.agenthub/state.json',
      intervalMs: Number.parseInt(process.env['PERSISTENCE_INTERVAL'] ?? '60000', 10),
      autoRestore: process.env['PERSISTENCE_AUTO_RESTORE'] !== 'false',
    };
  }

  // Expert Worker configuration
  config.expertWorker = {
    enabled: config.azureOpenAI !== undefined,
    maxConcurrent: Number.parseInt(process.env['EXPERT_MAX_CONCURRENT'] ?? '1', 10),
    pollingInterval: Number.parseInt(process.env['EXPERT_POLL_INTERVAL'] ?? '5000', 10),
    retrieveInterval: Number.parseInt(process.env['EXPERT_RETRIEVE_INTERVAL'] ?? '5000', 10),
    progressInterval: Number.parseInt(process.env['EXPERT_PROGRESS_INTERVAL'] ?? '10000', 10),
    retryAttempts: Number.parseInt(process.env['EXPERT_RETRY_ATTEMPTS'] ?? '2', 10),
    requestTTL: Number.parseInt(process.env['EXPERT_REQUEST_TTL'] ?? '86400000', 10),
    maxPendingPerAgent: Number.parseInt(process.env['EXPERT_MAX_PENDING'] ?? '3', 10),
  };

  return config;
}

/**
 * Main application
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('AgentHub - Lean MCP Orchestrator');
  console.log('='.repeat(60));

  const config = loadConfig();

  console.log(`\nConfiguration:`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Host: ${config.host}`);
  console.log(`  Watch Root: ${config.watchRoot ?? 'not configured'}`);
  console.log(
    `  Azure OpenAI: ${config.azureOpenAI !== undefined ? 'configured' : 'not configured'}`,
  );
  console.log(
    `  Persistence: ${config.persistence !== undefined ? `enabled (${config.persistence.snapshotPath})` : 'disabled'}`,
  );
  console.log();

  // Initialize core components
  console.log('Initializing core components...');

  const bus = new MessageBus(config);
  console.log('✓ Message Bus');

  const state = new StateCache(bus, config);
  console.log('✓ State Cache');

  // Initialize persistence and restore state if enabled
  let persistence: PersistenceManager | null = null;
  if (config.persistence !== undefined) {
    persistence = new PersistenceManager(config.persistence);

    if (config.persistence.autoRestore) {
      const snapshot = await persistence.load();
      if (snapshot !== undefined) {
        state.restore(snapshot);
      }
    }

    persistence.startAutoSave(state);
    console.log('✓ Persistence Manager');
  }

  const coordinator = new Coordinator(bus, state, config);
  console.log('✓ Intent Coordinator');

  const expert = new ExpertBridge(config);
  console.log('✓ Expert Bridge');

  // Initialize Expert Worker for async consultations
  const expertWorker = new ExpertWorker(state, expert, bus, {
    enabled: expert.isAvailable(),
    maxConcurrent: Number.parseInt(process.env['EXPERT_MAX_CONCURRENT'] ?? '1', 10),
    pollingInterval: Number.parseInt(process.env['EXPERT_POLL_INTERVAL'] ?? '5000', 10),
    retrieveInterval: Number.parseInt(process.env['EXPERT_RETRIEVE_INTERVAL'] ?? '5000', 10),
    progressInterval: Number.parseInt(process.env['EXPERT_PROGRESS_INTERVAL'] ?? '10000', 10),
    retryAttempts: Number.parseInt(process.env['EXPERT_RETRY_ATTEMPTS'] ?? '2', 10),
    requestTTL: Number.parseInt(process.env['EXPERT_REQUEST_TTL'] ?? '86400000', 10), // 24h
    maxPendingPerAgent: Number.parseInt(process.env['EXPERT_MAX_PENDING'] ?? '3', 10),
  });

  if (expert.isAvailable()) {
    expertWorker.start();
    console.log('✓ Expert Worker (async processing)');
  }

  // Initialize filesystem watcher if configured
  let watcher: FilesystemWatcher | null = null;
  if (config.watchRoot !== undefined && config.watchRoot.length > 0) {
    watcher = new FilesystemWatcher(bus, coordinator, config);
    watcher.start(config.watchRoot);
    console.log('✓ Filesystem Watcher');
  }

  // Create and start MCP server
  console.log('\nStarting MCP server...');
  const mcpServer = createMCPServer(bus, state, coordinator, expert, config);
  const httpApp = createHttpTransport(
    mcpServer,
    bus,
    state,
    config.port,
    config.host,
    config.logLevel,
  );

  console.log(`\n${'='.repeat(60)}`);
  console.log('AgentHub is ready!');
  console.log('='.repeat(60));
  console.log(`\n🚀 Server:    http://${config.host}:${config.port}`);
  console.log(`🔌 MCP:       http://${config.host}:${config.port}/mcp`);
  console.log(`💓 Health:    http://${config.host}:${config.port}/health`);
  console.log(`📊 Dashboard: http://${config.host}:${config.port}/state/live`);
  console.log('\nPress Ctrl+C to stop\n');

  // Graceful shutdown
  let shutdownInProgress = false;
  process.on('SIGINT', async () => {
    if (shutdownInProgress) {
      console.log('[SIGINT] Already shutting down, ignoring duplicate signal');
      return;
    }
    shutdownInProgress = true;

    console.log('\n\n[SIGINT] Signal received, starting shutdown...');
    console.log(`[SIGINT] Process PID: ${process.pid}`);
    console.log(`[SIGINT] Node version: ${process.version}`);

    // Check active handles before cleanup (Node internal debugging)
    const processWithHandles = process as typeof process & {
      _getActiveHandles?: () => unknown[];
    };
    if (processWithHandles._getActiveHandles !== undefined) {
      const handlesBefore = processWithHandles._getActiveHandles();
      console.log(`[SIGINT] Active handles before cleanup: ${handlesBefore.length}`);
      console.log(
        '[SIGINT] Handle types:',
        handlesBefore
          .map((h: unknown) =>
            typeof h === 'object' && h !== null && 'constructor' in h
              ? (h.constructor as { name: string }).name
              : 'unknown',
          )
          .join(', '),
      );
    }

    // Close HTTP server synchronously (get the server instance)
    const appWithServer = httpApp as typeof httpApp & {
      httpServer?: ReturnType<typeof httpApp.listen>;
    };
    if (appWithServer.httpServer !== undefined) {
      console.log('[SIGINT] Closing HTTP server...');
      // Force close all connections and server without waiting
      try {
        const server = appWithServer.httpServer;

        // Get active connections and destroy them
        server.getConnections((_err, count) => {
          console.log(`[SIGINT] Destroying ${count} active HTTP connections`);
        });

        // Force close without callback
        if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
          server.closeAllConnections(); // Node 18.2+ method
        }
        server.close();
        console.log('[SIGINT] ✓ HTTP server closed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`[SIGINT] HTTP server close error (ignoring): ${errorMessage}`);
      }
    }

    console.log('[SIGINT] Stopping cleanup timers...');
    state.stopCleanupTimers();
    console.log('[SIGINT] ✓ Cleanup timers stopped');

    console.log('[SIGINT] Clearing vote timers...');
    coordinator.clearVoteTimers();
    console.log('[SIGINT] ✓ Vote timers cleared');

    // Stop expert worker if running
    if (expert.isAvailable()) {
      console.log('[SIGINT] Stopping expert worker...');
      await expertWorker.stop();
      console.log('[SIGINT] ✓ Expert worker stopped');
    }

    // Save final snapshot before clearing state
    if (persistence !== null) {
      console.log('[SIGINT] Saving final snapshot...');
      persistence.stopAutoSave();
      try {
        const snapshot = state.getSnapshot();
        await persistence.save(snapshot);
        console.log('[SIGINT] ✓ Final snapshot saved');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`[SIGINT] Final snapshot save failed (ignoring): ${errorMessage}`);
      }
    }

    console.log('[SIGINT] Clearing message bus...');
    bus.clear();
    console.log('[SIGINT] ✓ Message bus cleared');

    console.log('[SIGINT] Clearing state cache...');
    state.clear();
    console.log('[SIGINT] ✓ State cache cleared');

    // Check active handles after cleanup (Node internal debugging)
    if (processWithHandles._getActiveHandles !== undefined) {
      const handlesAfter = processWithHandles._getActiveHandles();
      console.log(`[SIGINT] Active handles after cleanup: ${handlesAfter.length}`);
      console.log(
        '[SIGINT] Handle types:',
        handlesAfter
          .map((h: unknown) =>
            typeof h === 'object' && h !== null && 'constructor' in h
              ? (h.constructor as { name: string }).name
              : 'unknown',
          )
          .join(', '),
      );
    }

    console.log('[SIGINT] Goodbye!');
    console.log('[SIGINT] Calling process.exit(0)...');

    // Exit immediately
    process.exit(0);
  });
}

// Run the application
main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
