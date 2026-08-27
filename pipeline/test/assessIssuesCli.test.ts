import { describe, expect, it } from 'vitest';
import { HelpRequested, parseAssessIssuesArgs } from '../src/assessIssues.js';

describe('issue assessment CLI', () => {
  it('defaults to twenty pending assessments', () => {
    expect(parseAssessIssuesArgs([])).toEqual({ all: false, dryRun: false, force: false, limit: 20 });
  });

  it('parses dry-run, force, all, limit, and pnpm separator', () => {
    expect(parseAssessIssuesArgs(['--', '--all', '--dry-run', '--force'])).toEqual({
      all: true, dryRun: true, force: true,
    });
    expect(parseAssessIssuesArgs(['--limit', '7'])).toMatchObject({ limit: 7 });
  });

  it.each([
    ['--limit', '0'], ['--limit'], ['--all', '--limit', '2'], ['--unknown'],
  ])('rejects invalid arguments %#', (...args) => {
    expect(() => parseAssessIssuesArgs(args)).toThrow();
  });

  it('signals help', () => {
    expect(() => parseAssessIssuesArgs(['--help'])).toThrow(HelpRequested);
  });
});
