/**
 * Expert Bridge - Azure OpenAI Responses API integration
 * Handles escalation to GPT-5 Pro for complex issues
 *
 * Formats consultation documents following proven GPT-5-Pro structure:
 * 1. Question - Clear problem statement
 * 2. Code Context - Full files formatted as markdown with syntax highlighting
 * 3. Guidance Request - Specific recommendations needed
 */

import { AzureOpenAI } from 'openai';
import { getBearerTokenProvider, DefaultAzureCredential } from '@azure/identity';
import { readFileSync, existsSync } from 'fs';
import { extname, basename, resolve } from 'path';
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
   * Detect MIME type from file extension
   */
  private detectMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.ts': 'text/x-typescript',
      '.tsx': 'text/x-typescript',
      '.js': 'text/javascript',
      '.jsx': 'text/javascript',
      '.json': 'application/json',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.py': 'text/x-python',
      '.sh': 'text/x-shellscript',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
    };
    return mimeMap[ext] ?? 'text/plain';
  }


  /**
   * Read file and convert to base64 data URL for Responses API
   */
  private readFileAsBase64DataURL(filePath: string): {
    filename: string;
    file_data: string;
  } | null {
    try {
      const absolutePath = resolve(filePath);

      if (!existsSync(absolutePath)) {
        console.warn(`[ExpertBridge] File not found: ${absolutePath}`);
        return null;
      }

      const content = readFileSync(absolutePath);
      const base64 = content.toString('base64');
      const mimeType = this.detectMimeType(filePath);
      const filename = basename(filePath);

      return {
        filename,
        file_data: `data:${mimeType};base64,${base64}`,
      };
    } catch (error) {
      console.error(`[ExpertBridge] Error reading file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Ask the expert for help using Responses API with base64 file attachments
   *
   * Follows proven GPT-5-Pro consultation pattern:
   * 1. Question (input_text)
   * 2. Code files (input_file with base64)
   * 3. Guidance request in instructions
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
      console.log(`[ExpertBridge] Analyzing ${files.length} file(s)`);

      // Build content array: question text + file attachments
      const content: Array<
        | { type: 'input_text'; text: string }
        | { type: 'input_file'; filename: string; file_data: string }
      > = [
        {
          type: 'input_text',
          text: prompt,
        },
      ];

      // Add each file as base64 attachment
      let filesAttached = 0;
      for (const file of files) {
        const fileData = this.readFileAsBase64DataURL(file);
        if (fileData !== null) {
          content.push({
            type: 'input_file',
            filename: fileData.filename,
            file_data: fileData.file_data,
          });
          filesAttached++;
        }
      }

      console.log(`[ExpertBridge] Attached ${filesAttached}/${files.length} files`);

      // Use correct Responses API structure with file attachments
      const response = await this.client.responses.create({
        model: this.config.azureOpenAI.deployment,
        input: [
          {
            role: 'user',
            content,
          },
        ],
        instructions:
          'You are a code architecture expert. Analyze the code and question, then provide specific, actionable recommendations. Be concise and focus on the most important issues. Use markdown formatting for code snippets.',
        text: { verbosity: verb },
        reasoning: { effort },
        max_output_tokens: 4000,
      });

      // Extract clean text output
      const output = response.output_text ?? JSON.stringify(response.output, null, 2);

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
