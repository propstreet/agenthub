/**
 * Expert Bridge - Azure OpenAI Responses API integration
 * Handles escalation to GPT-5 Pro for complex issues
 *
 * Formats consultation documents following proven GPT-5-Pro structure:
 * 1. Question - Clear problem statement
 * 2. Code Context - Full files formatted as markdown with syntax highlighting
 * 3. Guidance Request - Specific recommendations needed
 */

import OpenAI from 'openai';
import { readFileSync, existsSync } from 'fs';
import { extname, basename, resolve } from 'path';
import type { ExpertAskPayload, ServerConfig } from '../types/models.js';

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
      console.warn(
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

        console.log(`[ExpertBridge] Initialized with API key authentication (v1 endpoint)`);
      } else {
        // Entra ID (Azure AD) authentication
        // Note: v1 endpoint with Entra ID not yet supported
        // Recommend using API key for expert.ask
        console.warn(
          '[ExpertBridge] Entra ID authentication not supported for v1 endpoint yet. Please use AZURE_OPENAI_API_KEY.',
        );
        this.isConfigured = false;
        return;
      }

      this.isConfigured = true;
    } catch (error) {
      console.error('[ExpertBridge] Initialization failed:', error);
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
        console.warn(`[ExpertBridge] File not found: ${absolutePath}`);
        return null;
      }

      const content = readFileSync(absolutePath, 'utf8');
      const language = this.detectLanguage(filePath);

      return `# File: ${filePath}\n\`\`\`${language}\n${content}\n\`\`\``;
    } catch (error) {
      console.error(`[ExpertBridge] Error reading file ${filePath}:`, error);
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
        console.warn(`[ExpertBridge] File not found: ${absolutePath}`);
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
      console.error(`[ExpertBridge] Error reading PDF ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Ask the expert for help using Responses API
   *
   * Follows proven GPT-5-Pro consultation pattern (claude-powerpack:ask-expert):
   * 1. Question + code context formatted as markdown (input_text)
   * 2. PDF files only as attachments (input_file with base64)
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
      // Each file gets its own heading (# File: {path}) - no generic section header needed
      const textParts: string[] = [prompt];

      if (codeFiles.length > 0) {
        let codeFilesIncluded = 0;

        for (const file of codeFiles) {
          const formatted = this.formatCodeAsMarkdown(file);
          if (formatted !== null) {
            textParts.push(`\n\n${formatted}`);
            codeFilesIncluded++;
          }
        }

        console.log(`[ExpertBridge] Included ${codeFilesIncluded}/${codeFiles.length} code files`);
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
        console.log(`[ExpertBridge] Attached ${pdfsAttached}/${pdfFiles.length} PDF files`);
      }

      // Use correct Responses API structure
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
      const output = response.output_text;

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
