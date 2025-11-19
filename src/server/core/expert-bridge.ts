/**
 * Expert Bridge - Azure OpenAI Responses API integration
 * Handles escalation to GPT-5 Pro for complex issues
 *
 * Uses Azure OpenAI v1 API endpoint (no api-version needed)
 * Formats code as markdown following claude-powerpack:ask-expert pattern:
 * 1. Question - Clear problem statement
 * 2. Code files - Formatted as markdown code blocks (# File: {path})
 * 3. PDF files - Attached as base64 input_file
 * 4. Guidance - Specific recommendations from GPT-5 Pro
 */

import OpenAI from 'openai';
import { readFileSync, existsSync } from 'fs';
import { extname, basename, resolve } from 'path';
import type { ExpertRequestPayload, ServerConfig } from '../types/models.js';
import { logger } from './logger.js';

export class ExpertBridge {
  private client: OpenAI | null = null;
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
      logger.warn(
        '[ExpertBridge] Azure OpenAI not configured - expert escalation will be disabled',
      );
      return;
    }

    const { endpoint, apiKey } = this.config.azureOpenAI;

    try {
      if (apiKey !== undefined && apiKey.length > 0) {
        // API Key authentication with v1 endpoint
        // Use standard OpenAI client with Azure v1 baseURL
        this.client = new OpenAI({
          apiKey,
          baseURL: `${endpoint}/openai/v1/`,
          defaultHeaders: {
            'api-key': apiKey, // Azure requires 'api-key' header
          },
        });

        logger.info('[ExpertBridge] Initialized with API key authentication (v1 endpoint)');
      } else {
        // Entra ID (Azure AD) authentication
        // Note: v1 endpoint with Entra ID not yet supported
        // Recommend using API key for expert.request
        logger.warn(
          '[ExpertBridge] Entra ID authentication not supported for v1 endpoint yet. Please use AZURE_OPENAI_API_KEY.',
        );
        this.isConfigured = false;
        return;
      }

      this.isConfigured = true;
    } catch (error) {
      logger.error({ err: error }, '[ExpertBridge] Initialization failed');
      this.isConfigured = false;
    }
  }

  /**
   * Detect programming language from file extension for syntax highlighting
   * Based on claude-powerpack:ask-expert pattern
   */
  private detectLanguage(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.cs': 'csharp',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.json': 'json',
      '.md': 'markdown',
      '.sql': 'sql',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.sh': 'bash',
      '.py': 'python',
      '.vue': 'vue',
      '.txt': 'text',
    };
    return langMap[ext] ?? 'text';
  }

  /**
   * Check if file is a PDF
   */
  private isPDF(filePath: string): boolean {
    return extname(filePath).toLowerCase() === '.pdf';
  }

  /**
   * Format code file as markdown code block
   * Based on claude-powerpack:ask-expert pattern
   */
  private formatCodeAsMarkdown(filePath: string): string | null {
    try {
      const absolutePath = resolve(filePath);

      if (!existsSync(absolutePath)) {
        logger.warn({ filePath }, '[ExpertBridge] File not found');
        return null;
      }

      const content = readFileSync(absolutePath, 'utf8');
      const language = this.detectLanguage(filePath);

      return `# File: ${filePath}\n\`\`\`${language}\n${content}\n\`\`\``;
    } catch (error) {
      logger.error({ err: error, filePath }, '[ExpertBridge] Error reading file');
      return null;
    }
  }

  /**
   * Read PDF file and convert to base64 data URL for Responses API
   * Only PDFs are supported as input_file attachments
   */
  private readPDFAsBase64DataURL(filePath: string): {
    filename: string;
    file_data: string;
  } | null {
    try {
      const absolutePath = resolve(filePath);

      if (!existsSync(absolutePath)) {
        logger.warn({ filePath }, '[ExpertBridge] File not found');
        return null;
      }

      const content = readFileSync(absolutePath);
      const base64 = content.toString('base64');
      const filename = basename(filePath);

      return {
        filename,
        file_data: `data:application/pdf;base64,${base64}`,
      };
    } catch (error) {
      logger.error({ err: error, filePath }, '[ExpertBridge] Error reading PDF');
      return null;
    }
  }

  /**
   * Build content array from prompt and files
   * Extracted for reuse between sync and async methods
   */
  private buildContent(
    prompt: string,
    files: string[],
  ): (
    | { type: 'input_text'; text: string }
    | { type: 'input_file'; filename: string; file_data: string }
  )[] {
    // Separate PDFs from code files
    const pdfFiles: string[] = [];
    const codeFiles: string[] = [];

    for (const file of files) {
      if (this.isPDF(file)) {
        pdfFiles.push(file);
      } else {
        codeFiles.push(file);
      }
    }

    // Build input_text: prompt + code files as markdown
    const textParts: string[] = [prompt];

    let codeFilesIncluded = 0;
    for (const file of codeFiles) {
      const formatted = this.formatCodeAsMarkdown(file);
      if (formatted !== null) {
        textParts.push(`\n\n${formatted}`);
        codeFilesIncluded++;
      }
    }

    if (codeFiles.length > 0) {
      logger.debug(
        { included: codeFilesIncluded, total: codeFiles.length },
        '[ExpertBridge] Included code files',
      );
    }

    const inputText = textParts.join('');

    // Build content array: text + PDF attachments
    const content: (
      | { type: 'input_text'; text: string }
      | { type: 'input_file'; filename: string; file_data: string }
    )[] = [
      {
        type: 'input_text',
        text: inputText,
      },
    ];

    // Add PDF files as base64 attachments
    let pdfsAttached = 0;
    for (const file of pdfFiles) {
      const fileData = this.readPDFAsBase64DataURL(file);
      if (fileData !== null) {
        content.push({
          type: 'input_file',
          filename: fileData.filename,
          file_data: fileData.file_data,
        });
        pdfsAttached++;
      }
    }

    if (pdfsAttached > 0) {
      logger.debug(
        { attached: pdfsAttached, total: pdfFiles.length },
        '[ExpertBridge] Attached PDF files',
      );
    }

    return content;
  }

  /**
   * Submit expert request in background mode
   * Returns immediately with responseId for polling
   */
  async askBackground(payload: ExpertRequestPayload): Promise<{
    responseId: string;
    status: string;
  }> {
    if (!this.isConfigured || this.client === null) {
      throw new Error('Azure OpenAI expert bridge is not configured');
    }

    if (this.config.azureOpenAI === undefined) {
      throw new Error('Azure OpenAI configuration missing');
    }

    const { question, paths, previousResponseId } = payload;

    // Use system config for model parameters
    const effort = this.config.azureOpenAI.effort ?? 'high';
    const verb = this.config.azureOpenAI.verbosity ?? 'low';

    try {
      logger.info(
        { promptSnippet: question.slice(0, 100), fileCount: paths.length },
        '[ExpertBridge] Creating background job',
      );

      // Build content using extracted method
      const content = this.buildContent(question, paths);

      // Log if this is a follow-up question
      if (previousResponseId !== undefined && previousResponseId.length > 0) {
        logger.info({ previousResponseId }, '[ExpertBridge] Follow-up request');
      }

      // Create background job
      // Note: Using Record<string, unknown> type due to TypeScript issue with previous_response_id
      // See: https://github.com/openai/openai-node/issues/1547
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: Record<string, any> = {
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
        background: true, // Background mode!
        store: true, // Required for context retention (24h)
        // No max_output_tokens - let model decide
        // No stream - polling mode
      };

      // Add previous_response_id for follow-up questions
      if (previousResponseId !== undefined && previousResponseId.length > 0) {
        params['previous_response_id'] = previousResponseId;
      }

      const response = await this.client.responses.create(params);

      logger.info(
        { responseId: response.id, status: response.status },
        '[ExpertBridge] Background job created',
      );

      return {
        responseId: response.id,
        status: response.status ?? 'unknown',
      };
    } catch (error) {
      logger.error({ err: error }, '[ExpertBridge] Background job creation failed');

      if (error instanceof Error) {
        throw new Error(`Expert background job failed: ${error.message}`);
      }

      throw new Error('Expert background job failed: unknown error');
    }
  }

  /**
   * Retrieve job status from Azure
   */
  async retrieve(responseId: string): Promise<{
    status: string;
    output_text: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      reasoning_tokens?: number;
    };
    incomplete_details?: {
      reason: string;
    };
  }> {
    if (!this.isConfigured || this.client === null) {
      throw new Error('Azure OpenAI expert bridge is not configured');
    }

    const response = await this.client.responses.retrieve(responseId);

    // Build result object with proper optional handling
    const result: {
      status: string;
      output_text: string;
      usage?: {
        input_tokens: number;
        output_tokens: number;
        reasoning_tokens?: number;
      };
      incomplete_details?: {
        reason: string;
      };
    } = {
      status: response.status ?? 'unknown',
      output_text: response.output_text,
    };

    // Add usage if present
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (response.usage !== null && response.usage !== undefined) {
      const usageData: {
        input_tokens: number;
        output_tokens: number;
        reasoning_tokens?: number;
      } = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      };

      // Only add reasoning_tokens if it exists and is a number
      // Using type assertion since SDK doesn't include reasoning_tokens yet
      const responseUsage = response.usage as {
        input_tokens: number;
        output_tokens: number;
        reasoning_tokens?: number;
      };
      if (responseUsage.reasoning_tokens !== undefined && responseUsage.reasoning_tokens !== 0) {
        usageData.reasoning_tokens = responseUsage.reasoning_tokens;
      }

      result.usage = usageData;
    }

    // Add incomplete_details if present
    // Note: response.incomplete_details is typed as nullable in SDK
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (response.incomplete_details !== null && response.incomplete_details !== undefined) {
      result.incomplete_details = {
        reason: response.incomplete_details.reason ?? 'unknown',
      };
    }

    return result;
  }

  /**
   * Cancel background job
   */
  async cancel(responseId: string): Promise<void> {
    if (!this.isConfigured || this.client === null) {
      throw new Error('Azure OpenAI expert bridge is not configured');
    }

    await this.client.responses.cancel(responseId);
    logger.info({ responseId }, '[ExpertBridge] Cancelled job');
  }

  /**
   * Delete background job (cleanup)
   */
  async delete(responseId: string): Promise<void> {
    if (!this.isConfigured || this.client === null) {
      throw new Error('Azure OpenAI expert bridge is not configured');
    }

    try {
      await this.client.responses.delete(responseId);
      logger.debug({ responseId }, '[ExpertBridge] Deleted job');
    } catch {
      // Ignore errors (job might already be deleted)
      logger.debug({ responseId }, '[ExpertBridge] Delete job failed (may not exist)');
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
