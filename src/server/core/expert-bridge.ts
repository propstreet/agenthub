/**
 * Expert Bridge - Azure OpenAI Responses API integration
 * Handles escalation to GPT-5 Pro for complex issues
 */

import { AzureOpenAI } from 'openai';
import { getBearerTokenProvider, DefaultAzureCredential } from '@azure/identity';
import type { ExpertAskPayload, ServerConfig } from '../types/models.js';

export class ExpertBridge {
  private client: AzureOpenAI | null = null;
  private config: ServerConfig;
  private isConfigured = false;

  constructor(config: ServerConfig) {
    this.config = config;
    this.initialize();
  }

  /**
   * Initialize Azure OpenAI client
   */
  private initialize(): void {
    if (this.config.azureOpenAI === undefined) {
      console.warn(
        '[ExpertBridge] Azure OpenAI not configured - expert escalation will be disabled',
      );
      return;
    }

    const { endpoint, apiKey } = this.config.azureOpenAI;

    try {
      if (apiKey !== undefined && apiKey.length > 0) {
        // API Key authentication
        this.client = new AzureOpenAI({
          apiKey,
          endpoint,
          apiVersion: '2024-10-01-preview',
        });

        console.log('[ExpertBridge] Initialized with API key authentication');
      } else {
        // Entra ID (Azure AD) authentication
        const credential = new DefaultAzureCredential();
        const scope = 'https://cognitiveservices.azure.com/.default';
        const azureADTokenProvider = getBearerTokenProvider(credential, scope);

        this.client = new AzureOpenAI({
          azureADTokenProvider,
          endpoint,
          apiVersion: '2024-10-01-preview',
        });

        console.log('[ExpertBridge] Initialized with Entra ID authentication');
      }

      this.isConfigured = true;
    } catch (error) {
      console.error('[ExpertBridge] Initialization failed:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Ask the expert for help
   * Returns unified diffs and minimal notes
   */
  async ask(payload: ExpertAskPayload): Promise<string> {
    if (!this.isConfigured || this.client === null) {
      throw new Error('Azure OpenAI expert bridge is not configured');
    }

    if (this.config.azureOpenAI === undefined) {
      throw new Error('Azure OpenAI configuration missing');
    }

    const { prompt, files, effort = 'high', verb = 'low' } = payload;

    try {
      console.log(`[ExpertBridge] Asking expert: ${prompt.slice(0, 100)}...`);

      // Read files if they're paths (in real implementation)
      // For now, assume files is array of paths
      const filesContent: Record<string, string> = {};

      // In a real implementation, you'd read these files
      // For now, we'll just pass them as-is
      for (const file of files) {
        filesContent[file] = `<content of ${file}>`;
      }

      const response = await this.client.responses.create({
        model: this.config.azureOpenAI.deployment,
        input: [
          {
            role: 'developer',
            content:
              'You are a code expert. Analyze the issue and return unified diffs + minimal notes for fixing the problem. Be concise.',
          },
          {
            role: 'user',
            content: prompt,
          },
          {
            role: 'user',
            content: `Files:\n${JSON.stringify(filesContent, null, 2)}`,
          },
        ],
        text: { verbosity: verb },
        reasoning: { effort },
        max_output_tokens: 2000,
      });

      // Extract text from output
      // The Responses API returns a complex output structure
      // For now, return the stringified response
      const output = JSON.stringify(response.output, null, 2);

      console.log(`[ExpertBridge] Expert response received (${output.length} chars)`);

      return output;
    } catch (error) {
      console.error('[ExpertBridge] Expert ask failed:', error);

      if (error instanceof Error) {
        throw new Error(`Expert escalation failed: ${error.message}`);
      }

      throw new Error('Expert escalation failed: unknown error');
    }
  }

  /**
   * Check if expert is available
   */
  isAvailable(): boolean {
    return this.isConfigured && this.client !== null;
  }

  /**
   * Get configuration status
   */
  getStatus(): {
    configured: boolean;
    endpoint?: string;
    deployment?: string;
  } {
    const status: { configured: boolean; endpoint?: string; deployment?: string } = {
      configured: this.isConfigured,
    };

    if (this.config.azureOpenAI?.endpoint !== undefined) {
      status.endpoint = this.config.azureOpenAI.endpoint;
    }

    if (this.config.azureOpenAI?.deployment !== undefined) {
      status.deployment = this.config.azureOpenAI.deployment;
    }

    return status;
  }
}
