import { describe, expect, it } from 'vitest';

import { parseSmokeArgs } from '../src/smoke.js';

describe('parseSmokeArgs', () => {
  it('accepts a description after the pnpm separator', () => {
    expect(parseSmokeArgs([
      '--', '--description', 'Funciona perfectamente.',
    ])).toBe('Funciona perfectamente.');
  });

  it('rejects missing, duplicate, unknown, and malformed values', () => {
    expect(() => parseSmokeArgs(['--description'])).toThrow();
    expect(() => parseSmokeArgs(['--description', ''])).toThrow();
    expect(() => parseSmokeArgs(['--wat', 'x'])).toThrow();
  });
});
