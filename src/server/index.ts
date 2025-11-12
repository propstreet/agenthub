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
  createHttpTransport(mcpServer, config.port, config.host);

  console.log(`\n${'='.repeat(60)}`);
  console.log('AgentHub is ready!');
  console.log('='.repeat(60));
  console.log(`\nMCP endpoint: http://${config.host}:${config.port}/mcp`);
  console.log(`Health check: http://${config.host}:${config.port}/health`);
  console.log('\nPress Ctrl+C to stop\n');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down gracefully...');

    if (watcher !== null) {
      await watcher.stop();
    }

    bus.clear();
    state.clear();

    console.log('Goodbye!');
    process.exit(0);
  });
}

// Run the application
main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
