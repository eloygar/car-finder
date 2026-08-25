import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { vehicleQuerySchema } from './tools/schemas.js';
import type { VehicleQuery } from './tools/types.js';

const EXPECTED_TOOLS = ['check_known_issues', 'estimate_market_price'] as const;

export interface SmokeResult {
  tools: string[];
  checkKnownIssues: unknown;
  estimateMarketPrice: unknown;
}

export async function runSmoke(query: VehicleQuery): Promise<SmokeResult> {
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

    const [knownIssues, marketPrice] = await Promise.all([
      client.callTool({ name: 'check_known_issues', arguments: { ...query } }),
      client.callTool({ name: 'estimate_market_price', arguments: { ...query } }),
    ]);
    assertToolSucceeded('check_known_issues', knownIssues);
    assertToolSucceeded('estimate_market_price', marketPrice);

    return {
      tools: toolNames,
      checkKnownIssues: knownIssues.structuredContent ?? knownIssues.content,
      estimateMarketPrice: marketPrice.structuredContent ?? marketPrice.content,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function createServerTransport(options: { stderr?: 'inherit' | 'pipe' } = {}) {
  return new StdioClientTransport({
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['exec', 'tsx', 'mcp-server/src/server.ts'],
    cwd: process.cwd(),
    env: stringEnvironment(process.env),
    stderr: options.stderr ?? 'inherit',
  });
}

function stringEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export function parseSmokeArgs(argv: string[]): VehicleQuery {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  if (args.includes('--help')) {
    process.stdout.write(
      'Usage: pnpm mcp:smoke -- --brand <brand> --model <model> [--year <year>]\n',
    );
    process.exit(0);
  }

  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid argument near ${flag ?? '<end>'}`);
    }
    if (!['--brand', '--model', '--year'].includes(flag) || values.has(flag)) {
      throw new Error(`Unknown or duplicate option: ${flag}`);
    }
    values.set(flag, value);
  }

  const raw = {
    brand: values.get('--brand'),
    model: values.get('--model'),
    ...(values.has('--year') ? { year: Number(values.get('--year')) } : {}),
  };
  return vehicleQuerySchema.parse(raw);
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
