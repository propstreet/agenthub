/**
 * HTTP Transport for MCP Server
 * Handles Streamable HTTP requests with per-session transports
 */

import express, { type Express, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { StateCache } from '../core/state-cache.js';
import type { MessageBus } from '../core/bus.js';
import { handleStateResource } from '../resources/state.js';
import { runWithSession } from '../session-context.js';

export function createHttpTransport(
  mcpServer: McpServer,
  bus: MessageBus,
  state: StateCache,
  port: number,
  host: string,
  logLevel: 'info' | 'debug' = 'info',
): Express {
  const app = express();
  const isDebug = logLevel === 'debug';

  // Per-request transports - SDK expects one transport per HTTP request-response cycle
  // This avoids "No connection established" errors when clients close connections early

  // Track active connections for forceful shutdown
  const connections = new Set<import('net').Socket>();

  // Middleware
  app.use(express.json());

  // Response tracking middleware (debug only)
  if (isDebug) {
    app.use((req, res, next) => {
      const originalSend = res.send;
      const originalJson = res.json;
      const requestUuid = Math.random().toString(36).substring(2, 9);

      // Track when send() is called
      res.send = function (body) {
        console.log(`[HTTP:${requestUuid}] 🚀 res.send() called for ${req.method} ${req.path}`);
        return originalSend.call(this, body);
      };

      // Track when json() is called
      res.json = function (body) {
        console.log(`[HTTP:${requestUuid}] 🚀 res.json() called for ${req.method} ${req.path}`);
        return originalJson.call(this, body);
      };

      // Track when response finishes
      res.on('finish', () => {
        console.log(
          `[HTTP:${requestUuid}] ✓ Response finished for ${req.method} ${req.path}, status=${res.statusCode}`,
        );
      });

      // Track when response closes
      res.on('close', () => {
        console.log(`[HTTP:${requestUuid}] 🔌 Response closed for ${req.method} ${req.path}`);
      });

      next();
    });
  }

  // CORS for localhost only (security)
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin?.includes('localhost') === true) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    next();
  });

  // MCP POST endpoint - JSON-RPC requests
  app.post('/mcp', async (req: Request, res: Response): Promise<void> => {
    const requestStartTime = Date.now();
    const requestUuid = Math.random().toString(36).substring(2, 9);

    try {
      // Get MCP session ID from header (lowercase with hyphens per spec)
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Safely extract method and requestId from body
      let methodValue: unknown;
      let requestIdValue: unknown;
      if (typeof req.body === 'object' && req.body !== null) {
        const body = req.body as Record<string, unknown>;
        methodValue = body['method'];
        requestIdValue = body['id'];
      }

      // Log Accept header to check for SSE support issues (debug only)
      if (isDebug) {
        const acceptHeader = req.headers.accept;
        const sessionIdDisplay = sessionId !== undefined ? sessionId.substring(0, 8) : 'none';
        const methodDisplay = typeof methodValue === 'string' ? methodValue : 'unknown';
        const requestIdDisplay = typeof requestIdValue === 'string' ? requestIdValue : 'unknown';
        console.log(
          `[HTTP:${requestUuid}] 📥 POST received: method=${methodDisplay}, sessionId=${sessionIdDisplay}..., requestId=${requestIdDisplay}, accept=${acceptHeader ?? 'none'}, t=0ms`,
        );

        // Create a new transport for EVERY request (SDK expectation)
        // This prevents "No connection established" errors when clients close connections early
        console.log(
          `[HTTP:${requestUuid}] 🆕 Creating per-request transport for method=${methodDisplay}`,
        );
      }

      const transport = new StreamableHTTPServerTransport({
        // For non-initialize requests, we don't generate a new session ID
        sessionIdGenerator: isInitializeRequest(req.body) ? () => randomUUID() : undefined,
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          if (isDebug) {
            console.log(`[HTTP:${requestUuid}] ✅ Session initialized: ${id.substring(0, 8)}...`);
          }
          // Clean up session in state cache when session ends
          transport.onclose = () => {
            state.cleanupSession(id);
            if (isDebug) {
              console.log(`[HTTP:${requestUuid}] Session ${id.substring(0, 8)}... cleaned up`);
            }
          };
        },
        onsessionclosed: (id) => {
          state.cleanupSession(id);
          if (isDebug) {
            console.log(`[HTTP:${requestUuid}] Session closed: ${id.substring(0, 8)}...`);
          }
        },
      });

      // Connect MCP server to this transport for EVERY request
      await mcpServer.connect(transport);

      // Clean up transport when response closes (recommended by SDK)
      res.on('close', () => {
        void transport.close();
      });

      // Run request in session context (use MCP session ID)
      // Use random UUID fallback to avoid cross-talk between anonymous clients
      const mcpSessionId = transport.sessionId ?? sessionId ?? randomUUID();

      if (isDebug) {
        console.log(
          `[HTTP:${requestUuid}] 🔄 Before transport.handleRequest, t=${Date.now() - requestStartTime}ms`,
        );
      }

      await runWithSession(mcpSessionId, async () => {
        if (isDebug) {
          const handleStartTime = Date.now();
          console.log(`[HTTP:${requestUuid}] ⚙️  Inside runWithSession, calling handleRequest...`);

          await transport.handleRequest(req, res, req.body);

          const handleDuration = Date.now() - handleStartTime;
          console.log(`[HTTP:${requestUuid}] ✅ handleRequest returned after ${handleDuration}ms`);
        } else {
          await transport.handleRequest(req, res, req.body);
        }
      });

      if (isDebug) {
        const totalTime = Date.now() - requestStartTime;
        console.log(`[HTTP:${requestUuid}] 📤 POST completed, total=${totalTime}ms`);

        // Check if response was sent
        if (!res.headersSent) {
          console.warn(
            `[HTTP:${requestUuid}] ⚠️  WARNING: Response headers NOT sent after ${totalTime}ms! Response may be hanging.`,
          );
        } else {
          console.log(`[HTTP:${requestUuid}] ✓ Response headers were sent`);
        }
      }
    } catch (error) {
      const totalTime = Date.now() - requestStartTime;
      console.error(`[HTTP:${requestUuid}] ❌ POST error after ${totalTime}ms:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  // MCP GET endpoint - SSE streaming for server-initiated notifications
  app.get('/mcp', async (req: Request, res: Response): Promise<void> => {
    const requestUuid = Math.random().toString(36).substring(2, 9);

    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (isDebug) {
        const acceptHeader = req.headers.accept;
        const sessionIdDisplay = sessionId !== undefined ? sessionId.substring(0, 8) : 'none';
        console.log(
          `[HTTP:${requestUuid}] 📥 GET received: sessionId=${sessionIdDisplay}..., accept=${acceptHeader ?? 'none'}`,
        );
      }

      if (sessionId === undefined) {
        if (isDebug) {
          console.warn(`[HTTP:${requestUuid}] ❌ Missing session ID for GET request`);
        }
        res.status(400).send('Invalid or missing MCP session ID');
        return;
      }

      // Create per-request transport for SSE streaming
      if (isDebug) {
        console.log(`[HTTP:${requestUuid}] 🆕 Creating per-request transport for GET/SSE`);
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Don't generate new session for GET
        enableJsonResponse: false, // GET uses SSE, not JSON
      });

      await mcpServer.connect(transport);

      // Clean up transport when response closes (recommended by SDK)
      res.on('close', () => {
        void transport.close();
      });

      await runWithSession(sessionId, async () => {
        await transport.handleRequest(req, res, undefined);
      });
    } catch (error) {
      console.error(`[HTTP:${requestUuid}] ❌ GET request error:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  // MCP DELETE endpoint - Session cleanup
  app.delete('/mcp', async (req: Request, res: Response): Promise<void> => {
    const requestUuid = Math.random().toString(36).substring(2, 9);

    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (isDebug) {
        const sessionIdDisplay = sessionId !== undefined ? sessionId.substring(0, 8) : 'none';
        console.log(`[HTTP:${requestUuid}] 📥 DELETE received: sessionId=${sessionIdDisplay}...`);
      }

      if (sessionId === undefined) {
        if (isDebug) {
          console.warn(`[HTTP:${requestUuid}] ❌ Missing session ID for DELETE request`);
        }
        res.status(400).send('Invalid or missing MCP session ID');
        return;
      }

      if (isDebug) {
        console.log(`[HTTP:${requestUuid}] 🆕 Creating per-request transport for DELETE`);
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Don't generate new session for DELETE
        enableJsonResponse: true,
      });

      await mcpServer.connect(transport);

      // Clean up transport when response closes (recommended by SDK)
      res.on('close', () => {
        void transport.close();
      });

      await runWithSession(sessionId, async () => {
        await transport.handleRequest(req, res, undefined);
      });

      // Session cleanup
      state.cleanupSession(sessionId);
      if (isDebug) {
        console.log(`[HTTP:${requestUuid}] Session ${sessionId.substring(0, 8)}... cleaned up`);
      }
    } catch (error) {
      console.error(`[HTTP:${requestUuid}] ❌ DELETE request error:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response): void => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // State resource endpoint (for dashboard)
  app.get('/state/live', (_req: Request, res: Response): void => {
    try {
      const stateJson = handleStateResource(state);
      res.setHeader('Content-Type', 'application/json');
      res.send(stateJson);
    } catch (error) {
      console.error('[HTTP] State resource error:', error);
      res.status(500).json({
        error: 'Failed to retrieve state',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Dashboard broadcast endpoint (non-MCP, supervision only)
  app.post('/hub/broadcast', (req: Request, res: Response): void => {
    try {
      const body = req.body as { text?: unknown; topic?: unknown };
      const { text } = body;
      const topic = body.topic ?? 'supervision';

      // Validate text is a non-empty string
      if (typeof text !== 'string' || text.trim() === '') {
        res.status(400).json({ error: 'text required' });
        return;
      }

      // Validate topic is a string
      if (typeof topic !== 'string') {
        res.status(400).json({ error: 'topic must be a string' });
        return;
      }

      // Send message through bus (broadcast to all agents)
      const msg = bus.send({
        from: 'dashboard',
        // Omit 'to' field for broadcast (not set to undefined)
        type: 'chat',
        topic,
        text,
      });

      res.json({ ok: true, messageId: msg.id });
    } catch (error) {
      res.status(500).json({
        error: 'Broadcast failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Start server and capture server instance for graceful shutdown
  const server = app.listen(port, host, () => {
    console.log(`[HTTP] AgentHub listening on http://${host}:${port}/mcp`);
    console.log(`[HTTP] Health check available at http://${host}:${port}/health`);
  });

  // Disable keep-alive to ensure connections close quickly
  server.keepAliveTimeout = 0;

  // Track connections for forceful shutdown
  server.on('connection', (socket) => {
    connections.add(socket);
    // Disable keep-alive on the socket level too
    socket.setKeepAlive(false);
    socket.on('close', () => {
      connections.delete(socket);
    });
  });

  // Attach cleanup method for graceful shutdown
  (app as Express & { httpServer?: typeof server; close?: () => Promise<void> }).httpServer =
    server;
  (app as Express & { close?: () => Promise<void> }).close = async () => {
    console.log('[HTTP] Closing server...');

    // No longer need to close transports since they're per-request now
    // Each transport is cleaned up after its request completes

    // Forcefully destroy all active connections
    console.log(`[HTTP] Destroying ${connections.size} active connections`);
    for (const socket of connections) {
      socket.destroy();
    }
    connections.clear();

    // Close HTTP server (should be immediate since all connections are destroyed)
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log('[HTTP] Server close timed out, forcing...');
        resolve();
      }, 1000);

      server.close((err) => {
        clearTimeout(timeout);
        if (err !== undefined && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
          reject(err);
        } else {
          console.log('[HTTP] Server closed');
          resolve();
        }
      });
    });
  };

  return app;
}
