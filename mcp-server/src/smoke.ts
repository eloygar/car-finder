import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const EXPECTED_TOOLS = ['classify_vehicle_operability'] as const;

export interface SmokeResult {
  tools: string[];
  classification: unknown;
}

export async function runSmoke(description: string): Promise<SmokeResult> {
  const client = new Client({ name: 'car-finder-smoke', version: '0.1.0' });
  const transport = createServerTransport();

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const toolNames = listed.tools.map(({ name }) => name).sort();
    const expected = [...EXPECTED_TOOLS].sort();
    if (JSON.stringify(toolNames) !== JSON.stringify(expected)) {
      throw new Error(`Unexpected MCP tools: ${toolNames.join(', ')}`);
    }

    const classification = await client.callTool({
      name: 'classify_vehicle_operability',
      arguments: {
        description,
        status: 'unknown',
        confidence: 'low',
        evidence: [],
        reason: 'Smoke test validates the MCP protocol boundary only.',
      },
    });
    assertToolSucceeded('classify_vehicle_operability', classification);

    return {
      tools: toolNames,
      classification: classification.structuredContent ?? classification.content,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function createServerTransport(options: {
  stderr?: 'inherit' | 'pipe';
  enableLegacyTools?: boolean;
} = {}) {
  return new StdioClientTransport({
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['exec', 'tsx', 'mcp-server/src/server.ts'],
    cwd: process.cwd(),
    env: {
      ...stringEnvironment(process.env),
      ...(options.enableLegacyTools ? { MCP_ENABLE_LEGACY_TOOLS: 'true' } : {}),
    },
    stderr: options.stderr ?? 'inherit',
  });
}

function stringEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export function parseSmokeArgs(argv: string[]): string {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  if (args.includes('--help')) {
    process.stdout.write(
      'Usage: pnpm mcp:smoke -- --description <seller-description>\n',
    );
    process.exit(0);
  }

  if (args.length !== 2 || args[0] !== '--description' || !args[1]?.trim()) {
    throw new Error('Expected exactly --description <seller-description>');
  }
  return args[1].trim();
}

async function main(): Promise<void> {
  const query = parseSmokeArgs(process.argv.slice(2));
  const result = await runSmoke(query);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function assertToolSucceeded(name: string, result: { isError?: boolean }): void {
  if (result.isError) {
    throw new Error(`MCP tool ${name} failed`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
