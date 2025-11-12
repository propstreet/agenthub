/**
 * HTTP Transport for MCP Server
 * Handles Streamable HTTP requests
 */

import express, { type Express, type Request, type Response } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export function createHttpTransport(mcpServer: McpServer, port: number, host: string): Express {
  const app = express();

  // Middleware
  app.use(express.json());

  // CORS for localhost only (security)
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin?.includes('localhost') === true) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    next();
  });

  // MCP endpoint
  app.post('/mcp', async (req: Request, res: Response): Promise<void> => {
    try {
      // Create new transport for this request (critical for avoiding ID collisions)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      // Handle connection cleanup
      res.on('close', () => {
        transport.close().catch((error: unknown) => {
          console.error('[HTTP] Transport close error:', error);
        });
      });

      // Connect MCP server to transport
      await mcpServer.connect(transport);

      // Handle the HTTP request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[HTTP] Request handling error:', error);
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

  // Start server
  app.listen(port, host, () => {
    console.log(`[HTTP] AgentHub listening on http://${host}:${port}/mcp`);
    console.log(`[HTTP] Health check available at http://${host}:${port}/health`);
  });

  return app;
}
