import { describe, expect, it } from 'vitest';

import { HelpRequested, parseClassificationArgs } from '../src/classify.js';

describe('classification CLI', () => {
  it('defaults to ten pending listings', () => {
    expect(parseClassificationArgs([])).toEqual({
      all: false,
      dryRun: false,
      force: false,
      refreshKnownIssues: false,
      limit: 10,
    });
  });

  it('parses all, only, dry-run, force, and pnpm separator', () => {
    expect(parseClassificationArgs(['--', '--all', '--dry-run', '--force'])).toEqual({
      all: true,
      dryRun: true,
      force: true,
      refreshKnownIssues: false,
    });
    expect(parseClassificationArgs(['--only', 'external-1'])).toMatchObject({ only: 'external-1' });
    expect(parseClassificationArgs(['--refresh-known-issues'])).toMatchObject({ refreshKnownIssues: true });
  });

  it.each([
    ['--limit', '0'],
    ['--all', '--limit', '2'],
    ['--all', '--only', 'one'],
    ['--only', 'one', '--limit', '2'],
    ['--unknown'],
  ])('rejects invalid arguments %#', (...args) => {
    expect(() => parseClassificationArgs(args)).toThrow();
  });

  it('signals help without starting a run', () => {
    expect(() => parseClassificationArgs(['--help'])).toThrow(HelpRequested);
  });
});
