import { describe, expect, it, vi } from 'vitest';

import { KNOWN_ISSUE_SEED, seedKnownIssues } from '../../prisma/seedKnownIssues.js';
import type { DatabaseClient } from '../../shared/src/db/client.js';

describe('seedKnownIssues', () => {
  it('upserts deterministic records and never deletes unrelated data', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: KNOWN_ISSUE_SEED[0]!.id }]);
    const upsert = vi.fn((args: unknown) => Promise.resolve(args));
    const transaction = vi.fn((operations: Promise<unknown>[]) => Promise.all(operations));
    const deleteMany = vi.fn();
    const prisma = {
      knownIssue: { findMany, upsert, deleteMany },
      $transaction: transaction,
    } as unknown as DatabaseClient;

    const result = await seedKnownIssues(prisma);

    expect(result).toEqual({ total: 12, created: 11, updated: 1 });
    expect(upsert).toHaveBeenCalledTimes(12);
    expect(transaction).toHaveBeenCalledOnce();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(new Set(KNOWN_ISSUE_SEED.map(({ id }) => id)).size).toBe(12);
    expect(new Set(KNOWN_ISSUE_SEED.map(({ brand }) => brand))).toEqual(new Set([
      'Toyota',
      'Volkswagen',
      'Renault',
      'SEAT',
      'Peugeot',
      'BMW',
    ]));
    expect(KNOWN_ISSUE_SEED.every(({ source }) => source.startsWith('https://'))).toBe(true);
  });
});
