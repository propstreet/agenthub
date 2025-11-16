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
import { handleReviewRequest, handleReviewClaim, handleReviewComplete } from './tools/review.js';
import { handleExpertAsk } from './tools/expert.js';
import { handleStateGet } from './tools/state.js';
import { handleAgentRegister } from './tools/agents.js';
import { handleHelp } from './tools/help.js';

// Resource handlers
import { handleInboxResource } from './resources/inbox.js';
import { handleStateResource } from './resources/state.js';
import { handleMessagesResource } from './resources/messages.js';

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
  // Register hub_op Tool (Multi-Operation)
  // =========================================================================

  server.registerTool(
    'hub_op',
    {
      title: 'Hub Operation',
      description:
        'Multi-agent coordination. Ops: a.register (agent), i.open|i.vote|i.renew|i.close (intents), ' +
        'l.announce (lease), m.send|m.pull (messages), review.request|review.claim|review.complete (code review), ' +
        'expert.ask (escalation), s.get (state), s.help (self-discovery). ' +
        'Fields: agent, paths[], mode(R|W|B|T), priority(l|n|h|r), ttlMs',
      inputSchema: {
        op: z.enum([
          'a.register',
          'i.open',
          'i.vote',
          'i.renew',
          'i.close',
          'l.announce',
          'm.send',
          'm.pull',
          'review.request',
          'review.claim',
          'review.complete',
          'expert.ask',
          's.get',
          's.help',
        ]),
        d: z.record(z.unknown()),
      },
    },
    async ({ op, d }) => {
      const timestamp = Date.now();

      try {
        let result;

        switch (op) {
          // Agent operations
          case 'a.register':
            result = await handleAgentRegister(state, d);
            break;

          // Intent operations
          case 'i.open':
            result = await handleIntentOpen(state, coordinator, d);
            break;
          case 'i.vote':
            result = await handleIntentVote(state, coordinator, d);
            break;
          case 'i.renew':
            result = await handleIntentRenew(state, coordinator, d);
            break;
          case 'i.close':
            result = await handleIntentClose(state, coordinator, d);
            break;

          // Lease operations
          case 'l.announce':
            result = await handleLeaseAnnounce(state, coordinator, d);
            break;

          // Message operations
          case 'm.send':
            result = await handleMessageSend(state, bus, d);
            break;
          case 'm.pull':
            result = await handleMessagePull(state, bus, d);
            break;

          // Review operations
          case 'review.request':
            result = await handleReviewRequest(bus, state, d);
            break;
          case 'review.claim':
            result = await handleReviewClaim(state, bus, d);
            break;
          case 'review.complete':
            result = await handleReviewComplete(state, bus, d);
            break;

          // Expert escalation
          case 'expert.ask':
            result = await handleExpertAsk(expert, state, bus, d);
            break;

          // State query
          case 's.get':
            result = await handleStateGet(state, d);
            break;

          // Help / self-discovery
          case 's.help':
            result = await handleHelp();
            break;

          default:
            throw new Error(`Unknown operation: ${String(op)}`);
        }

        // Add inbox notification and broadcasts (except for m.pull which already shows messages)
        if (op !== 'm.pull' && op !== 's.help' && typeof result === 'object') {
          const agentName =
            (d['agent'] as string | undefined) ??
            (d['a'] as string | undefined) ??
            (d['from'] as string | undefined) ??
            (d['sender'] as string | undefined);

          if (agentName !== undefined && agentName !== '') {
            const allMessages = bus.getMessagesFor(agentName);

            // Separate broadcasts from direct messages
            const broadcasts = allMessages.filter(
              (msg) => msg.to === undefined && msg.from !== agentName,
            );
            const directMessages = allMessages.filter((msg) => msg.to === agentName);

            const modifiedResult = result as { inbox?: unknown; broadcasts?: unknown };

            // Show recent broadcasts directly (last 3, most recent first)
            if (broadcasts.length > 0) {
              const recentBroadcasts = broadcasts
                .sort((a, b) => b.ts - a.ts)
                .slice(0, 3)
                .map((msg) => ({
                  from: msg.from,
                  text: msg.text,
                  topic: msg.topic,
                  ts: msg.ts,
                }));

              modifiedResult.broadcasts = recentBroadcasts;
            }

            // Notify about direct messages
            if (directMessages.length > 0) {
              modifiedResult.inbox = {
                unread: directMessages.length,
                hint: `You have ${directMessages.length} direct message${directMessages.length === 1 ? '' : 's'}. Run m.pull to read.`,
              };
            }
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result),
            },
          ],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Add helpful hint for common errors
        let hint: string | undefined;
        if (errorMessage.includes('required') || errorMessage.includes('Unknown operation')) {
          hint = 'Try s.help for operation examples and field reference.';
        }

        const errorResult = {
          ok: false,
          error: errorMessage,
          ...(hint !== undefined && { hint }),
          t: timestamp,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(errorResult),
            },
          ],
          structuredContent: errorResult as unknown as Record<string, unknown>,
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

  // messages://recent - Convenience resource for pulling recent messages
  server.registerResource(
    'messages-recent',
    'messages://recent',
    {
      title: 'Recent Messages',
      description: 'Auto-pulls recent messages for current agent (no config needed)',
    },
    async (uri: URL) => {
      const json = await handleMessagesResource(state, bus);

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

  console.log('[MCP] Server initialized with hub_op tool and resources');

  return server;
}
