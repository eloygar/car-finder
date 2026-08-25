import { describe, expect, it } from 'vitest';

import { parseSmokeArgs } from '../src/smoke.js';

describe('parseSmokeArgs', () => {
  it('accepts pnpm separators and an optional year', () => {
    expect(parseSmokeArgs([
      '--', '--brand', 'Toyota', '--model', 'Corolla', '--year', '2023',
    ])).toEqual({ brand: 'Toyota', model: 'Corolla', year: 2023 });
  });

  it('rejects missing, duplicate, unknown, and malformed values', () => {
    expect(() => parseSmokeArgs(['--brand', 'Toyota'])).toThrow();
    expect(() => parseSmokeArgs([
      '--brand', 'Toyota', '--brand', 'BMW', '--model', 'Corolla',
    ])).toThrow('Unknown or duplicate');
    expect(() => parseSmokeArgs(['--brand', 'Toyota', '--model', 'Corolla', '--wat', 'x']))
      .toThrow('Unknown or duplicate');
    expect(() => parseSmokeArgs([
      '--brand', 'Toyota', '--model', 'Corolla', '--year', 'not-a-year',
    ])).toThrow();
  });
});
