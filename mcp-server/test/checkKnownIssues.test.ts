import { describe, expect, it, vi } from 'vitest';

import { checkKnownIssues } from '../src/tools/checkKnownIssues.js';
import type { McpToolRepository } from '../src/tools/types.js';

function repository(): McpToolRepository {
  return {
    findKnownIssues: vi.fn().mockResolvedValue([]),
    findComparablePrices: vi.fn().mockResolvedValue([]),
  };
}

describe('checkKnownIssues', () => {
  it('normalizes its query and maps repository records', async () => {
    const repo = repository();
    vi.mocked(repo.findKnownIssues).mockResolvedValue([
      {
        id: 'issue-1',
        issueDescription: 'Timing chain may wear prematurely.',
        severity: ' HIGH ',
        yearFrom: 2018,
        yearTo: 2020,
        source: 'https://example.com/recall',
      },
      {
        id: 'issue-2',
        issueDescription: 'Unclassified issue.',
        severity: 'urgent',
        yearFrom: null,
        yearTo: null,
        source: null,
      },
    ]);

    const result = await checkKnownIssues(
      { brand: ' Toyota ', model: ' Corolla ', year: 2020 },
      repo,
    );

    expect(repo.findKnownIssues).toHaveBeenCalledWith({
      brand: 'Toyota',
      model: 'Corolla',
      year: 2020,
    });
    expect(result).toEqual({
      hasKnownIssues: true,
      issues: [
        {
          id: 'issue-1',
          description: 'Timing chain may wear prematurely.',
          severity: 'high',
          yearFrom: 2018,
          yearTo: 2020,
          sourceUrl: 'https://example.com/recall',
        },
        {
          id: 'issue-2',
          description: 'Unclassified issue.',
          severity: 'unknown',
          yearFrom: null,
          yearTo: null,
          sourceUrl: null,
        },
      ],
    });
  });

  it('reports an empty result without swallowing repository failures', async () => {
    const repo = repository();
    await expect(checkKnownIssues({ brand: 'BMW', model: '1 Series' }, repo)).resolves.toEqual({
      hasKnownIssues: false,
      issues: [],
    });

    vi.mocked(repo.findKnownIssues).mockRejectedValueOnce(new Error('database unavailable'));
    await expect(checkKnownIssues({ brand: 'BMW', model: '1 Series' }, repo)).rejects.toThrow(
      'database unavailable',
    );
  });
});
