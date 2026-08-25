import { describe, expect, it, vi } from 'vitest';

import { estimateMarketPrice } from '../src/tools/estimateMarketPrice.js';
import type { McpToolRepository } from '../src/tools/types.js';

function repository(prices: string[]): McpToolRepository {
  return {
    findKnownIssues: vi.fn().mockResolvedValue([]),
    findComparablePrices: vi.fn().mockResolvedValue(prices),
  };
}

describe('estimateMarketPrice', () => {
  it('calculates deterministic decimal statistics and an optional year window', async () => {
    const repo = repository(['10000.00', '12000.01', '9000.00', '11000.00']);

    const result = await estimateMarketPrice(
      { brand: ' Volkswagen ', model: ' Golf ', year: 2020 },
      repo,
    );

    expect(repo.findComparablePrices).toHaveBeenCalledWith({
      brand: 'Volkswagen',
      model: 'Golf',
      year: 2020,
    });
    expect(result).toEqual({
      status: 'ok',
      currency: 'EUR',
      sampleSize: 4,
      filters: {
        brand: 'Volkswagen',
        model: 'Golf',
        yearWindow: { from: 2019, to: 2021 },
      },
      average: '10500.00',
      median: '10500.00',
      minimum: '9000.00',
      maximum: '12000.01',
    });
  });

  it('uses all years when omitted and requires three samples', async () => {
    const repo = repository(['10000.00', '12000.00']);

    await expect(estimateMarketPrice({ brand: 'SEAT', model: 'Leon' }, repo)).resolves.toEqual({
      status: 'insufficient_data',
      currency: 'EUR',
      sampleSize: 2,
      requiredSampleSize: 3,
      filters: { brand: 'SEAT', model: 'Leon', yearWindow: null },
    });
  });

  it('returns the middle price for an odd sample', async () => {
    const repo = repository(['15000.00', '9000.00', '11000.00']);
    const result = await estimateMarketPrice({ brand: 'BMW', model: '3 Series' }, repo);

    expect(result).toMatchObject({
      status: 'ok',
      average: '11666.67',
      median: '11000.00',
      minimum: '9000.00',
      maximum: '15000.00',
    });
  });
});
