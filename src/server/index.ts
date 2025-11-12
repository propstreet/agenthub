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

  const config: ServerConfig = {
    ...DEFAULT_CONFIG,
    port: Number.parseInt(process.env['PORT'] ?? '3333', 10),
    host: process.env['HOST'] ?? 'localhost',
    ...(watchRoot !== undefined && watchRoot.length > 0 && { watchRoot }),
  };

  // Azure OpenAI configuration (optional)
  const azureEndpoint = process.env['AZURE_OPENAI_ENDPOINT'];
  const apiKey = process.env['AZURE_OPENAI_API_KEY'];

  if (azureEndpoint !== undefined && azureEndpoint.length > 0) {
    config.azureOpenAI = {
      endpoint: azureEndpoint,
      ...(apiKey !== undefined && apiKey.length > 0 && { apiKey }),
      deployment: process.env['AZURE_EXPERT_DEPLOYMENT'] ?? 'gpt-5-pro',
    };
  }

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
  console.log();

  // Initialize core components
  console.log('Initializing core components...');

  const bus = new MessageBus(config);
  console.log('✓ Message Bus');

  const state = new StateCache(bus, config);
  console.log('✓ State Cache');

  const coordinator = new Coordinator(bus, state, config);
  console.log('✓ Intent Coordinator');

  const expert = new ExpertBridge(config);
  console.log('✓ Expert Bridge');

  // Initialize filesystem watcher if configured
  let watcher: FilesystemWatcher | null = null;
  if (config.watchRoot !== undefined && config.watchRoot.length > 0) {
    watcher = new FilesystemWatcher(bus, coordinator, config);
    watcher.start(config.watchRoot);
    console.log('✓ Filesystem Watcher');
  }

  // Create and start MCP server
  console.log('\nStarting MCP server...');
  const mcpServer = createMCPServer(bus, state, coordinator, expert);
  const httpApp = createHttpTransport(mcpServer, state, config.port, config.host);

  console.log(`\n${'='.repeat(60)}`);
  console.log('AgentHub is ready!');
  console.log('='.repeat(60));
  console.log(`\nMCP endpoint: http://${config.host}:${config.port}/mcp`);
  console.log(`Health check: http://${config.host}:${config.port}/health`);
  console.log(`Dashboard state: http://${config.host}:${config.port}/state/live`);
  console.log('\nPress Ctrl+C to stop\n');

  // Graceful shutdown
  let shutdownInProgress = false;
  process.on('SIGINT', () => {
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
      _getActiveHandles?: () => any[];
    };
    if (processWithHandles._getActiveHandles !== undefined) {
      const handlesBefore = processWithHandles._getActiveHandles();
      console.log(`[SIGINT] Active handles before cleanup: ${handlesBefore.length}`);
      console.log(
        '[SIGINT] Handle types:',
        handlesBefore.map((h: any) => h.constructor.name).join(', '),
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
        server.closeAllConnections?.(); // Node 18.2+ method
        server.close();
        console.log('[SIGINT] ✓ HTTP server closed');
      } catch (error) {
        console.log(`[SIGINT] HTTP server close error (ignoring): ${error}`);
      }
    }

    console.log('[SIGINT] Stopping cleanup timers...');
    state.stopCleanupTimers();
    console.log('[SIGINT] ✓ Cleanup timers stopped');

    console.log('[SIGINT] Clearing vote timers...');
    coordinator.clearVoteTimers();
    console.log('[SIGINT] ✓ Vote timers cleared');

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
        handlesAfter.map((h: any) => h.constructor.name).join(', '),
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
