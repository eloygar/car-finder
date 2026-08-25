import pino, { type Logger } from 'pino';

export function createMcpLogger(level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino(
    { level, base: { component: 'car-finder-mcp' } },
    pino.destination({ dest: 2, sync: false }),
  );
}
