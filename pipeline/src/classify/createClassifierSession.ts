import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/client';

import { createServerTransport } from '../../../mcp-server/src/smoke.js';
import { AnthropicMcpClassifier, type ClassificationMcpBridge } from './AnthropicMcpClassifier.js';
import type { ClassifierSession } from './types.js';
import type { BatchLogger } from '../search.js';

export async function createClassifierSession(options: {
  apiKey: string;
  model: string;
  logger?: BatchLogger;
}): Promise<ClassifierSession> {
  const mcpClient = new Client({ name: 'car-finder-classifier', version: '0.1.0' });
  const transport = createServerTransport({ stderr: 'inherit' });

  try {
    await mcpClient.connect(transport);
    const anthropic = new Anthropic({
      apiKey: options.apiKey,
      maxRetries: 3,
      timeout: 120_000,
    });
    const bridge: ClassificationMcpBridge = {
      listTools: async () => {
        const result = await mcpClient.listTools();
        return result.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as { type: 'object'; [key: string]: unknown },
        }));
      },
      callTool: async (name, args) => {
        const result = await mcpClient.callTool({ name, arguments: args });
        if (result.isError) throw new Error(`MCP tool ${name} failed`);
        return result.structuredContent ?? result.content;
      },
    };
    const classifier = await AnthropicMcpClassifier.create({
      modelClient: { create: (params) => anthropic.messages.create(params) },
      mcp: bridge,
      model: options.model,
      logger: options.logger,
    });
    return {
      classifier,
      close: () => mcpClient.close(),
    };
  } catch (error) {
    await mcpClient.close().catch(() => undefined);
    throw error;
  }
}
