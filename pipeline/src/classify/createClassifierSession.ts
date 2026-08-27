import { Client } from '@modelcontextprotocol/client';

import { createServerTransport } from '../../../mcp-server/src/smoke.js';
import { SequentialMcpClassifier, type ClassificationMcpBridge } from './SequentialMcpClassifier.js';
import type { ClassifierSession } from './types.js';
import type { BatchLogger } from '../search.js';

export async function createClassifierSession(options: {
  logger?: BatchLogger;
}): Promise<ClassifierSession> {
  const mcpClient = new Client({ name: 'car-finder-classifier', version: '0.1.0' });
  const transport = createServerTransport({ stderr: 'inherit' });

  try {
    await mcpClient.connect(transport);
    const bridge: ClassificationMcpBridge = {
      listTools: async () => {
        const result = await mcpClient.listTools();
        return result.tools.map((tool) => ({
          name: tool.name,
        }));
      },
      callTool: async (name, args) => {
        const result = await mcpClient.callTool({ name, arguments: args });
        if (result.isError) {
          throw new McpToolCallError(name, mcpErrorCode(result.content));
        }
        return result.structuredContent ?? result.content;
      },
    };
    const classifier = await SequentialMcpClassifier.create({
      mcp: bridge,
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

class McpToolCallError extends Error {
  readonly code: string;

  constructor(tool: string, toolCode?: string) {
    super(`MCP tool ${tool} failed`);
    this.name = 'McpToolCallError';
    this.code = toolCode ? `mcp_${toolCode}` : 'mcp_tool_failed';
  }
}

function mcpErrorCode(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (typeof block !== 'object' || block === null || Reflect.get(block, 'type') !== 'text') continue;
    const text = Reflect.get(block, 'text');
    if (typeof text !== 'string') continue;
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null) {
        const code = Reflect.get(parsed, 'error');
        if (typeof code === 'string') return code;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}
