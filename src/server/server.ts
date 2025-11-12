/**
 * MCP Server Setup
 * Registers tools and resources
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MessageBus } from './core/bus.js';
import type { StateCache } from './core/state-cache.js';
import type { Coordinator } from './core/coordinator.js';
import type { ExpertBridge } from './core/expert-bridge.js';

// Tool handlers
import {
  handleIntentOpen,
  handleIntentVote,
  handleIntentRenew,
  handleIntentClose,
} from './tools/intents.js';
import { handleLeaseAnnounce } from './tools/leases.js';
import { handleMessageSend, handleMessagePull } from './tools/messages.js';
import { handleReviewRequest } from './tools/review.js';
import { handleExpertAsk } from './tools/expert.js';
import { handleStateGet } from './tools/state.js';

// Resource handlers
import { handleInboxResource } from './resources/inbox.js';
import { handleStateResource } from './resources/state.js';

export function createMCPServer(
  bus: MessageBus,
  state: StateCache,
  coordinator: Coordinator,
  expert: ExpertBridge,
): McpServer {
  const server = new McpServer({
    name: 'agenthub',
    version: '0.1.0',
  });

  // =========================================================================
  // Register hub.op Tool (Multi-Operation)
  // =========================================================================

  server.registerTool(
    'hub.op',
    {
      title: 'Hub Operation',
      description:
        'Multi-agent coordination. Ops: i.open|i.vote|i.renew|i.close (intents), ' +
        'l.announce (lease), m.send|m.pull (messages), review.request (code review), ' +
        'expert.ask (escalation), s.get (state). ' +
        'Fields: agent, paths[], mode(R|W|B|T), priority(l|n|h|r), ttlMs',
      inputSchema: {
        op: z.enum([
          'i.open',
          'i.vote',
          'i.renew',
          'i.close',
          'l.announce',
          'm.send',
          'm.pull',
          'review.request',
          'expert.ask',
          's.get',
        ]),
        d: z.record(z.unknown()),
      },
    },
    async ({ op, d }) => {
      const timestamp = Date.now();

      try {
        let result;

        switch (op) {
          // Intent operations
          case 'i.open':
            result = await handleIntentOpen(coordinator, d);
            break;
          case 'i.vote':
            result = await handleIntentVote(coordinator, d);
            break;
          case 'i.renew':
            result = await handleIntentRenew(coordinator, d);
            break;
          case 'i.close':
            result = await handleIntentClose(coordinator, d);
            break;

          // Lease operations
          case 'l.announce':
            result = await handleLeaseAnnounce(coordinator, d);
            break;

          // Message operations
          case 'm.send':
            result = await handleMessageSend(bus, d);
            break;
          case 'm.pull':
            result = await handleMessagePull(bus, d);
            break;

          // Review operations
          case 'review.request':
            result = await handleReviewRequest(bus, state, d);
            break;

          // Expert escalation
          case 'expert.ask':
            result = await handleExpertAsk(expert, bus, d);
            break;

          // State query
          case 's.get':
            result = await handleStateGet(state, d);
            break;

          default:
            throw new Error(`Unknown operation: ${String(op)}`);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: false,
                error: errorMessage,
                t: timestamp,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // =========================================================================
  // Register Resources
  // =========================================================================

  // inbox://{agent} - Messages for specific agent
  server.registerResource(
    'agent-inbox',
    new ResourceTemplate('inbox://{agent}', { list: undefined }),
    {
      title: 'Agent Inbox',
      description: 'Messages for agent (NDJSON)',
    },
    async (uri: URL, { agent }: Record<string, unknown>) => {
      const ndjson = handleInboxResource(bus, agent as string);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/x-ndjson',
            text: ndjson,
          },
        ],
      };
    },
  );

  // state://live - Live state snapshot
  server.registerResource(
    'state-live',
    'state://live',
    {
      title: 'Live State',
      description: 'Current agents, intents, leases, reviews',
    },
    async (uri: URL) => {
      const json = handleStateResource(state);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: json,
          },
        ],
      };
    },
  );

  // Set error handler on the underlying server
  server.server.onerror = (error: Error): void => {
    console.error('[MCP] Protocol error:', error);
  };

  console.log('[MCP] Server initialized with hub.op tool and resources');

  return server;
}
