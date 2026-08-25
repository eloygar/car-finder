import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { parseReconcileCliArgs, reconcileFile } from '../src/reconcile.js';
import type { ReconciliationRepository } from '../src/reconcile/types.js';

function repository(): ReconciliationRepository {
  return {
    findExisting: vi.fn().mockResolvedValue([]),
    apply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('parseReconcileCliArgs', () => {
  it('uses the default raw capture', () => {
    expect(parseReconcileCliArgs([], '/work')).toEqual({
      inputPath: '/work/output/raw-listings.json',
      dryRun: false,
    });
  });

  it('accepts pnpm separator, custom input, and dry-run', () => {
    expect(
      parseReconcileCliArgs(['--', '--input', 'capture.json', '--dry-run'], '/work'),
    ).toEqual({ inputPath: '/work/capture.json', dryRun: true });
  });

  it.each([
    ['--input'],
    ['--unknown'],
    ['--', '--dry-run', '--unknown'],
  ])('rejects invalid arguments', (...args) => {
    expect(() => parseReconcileCliArgs(args, '/work')).toThrow();
  });
});

describe('reconcileFile', () => {
  it('rejects malformed JSON without querying the repository', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'car-finder-reconcile-'));
    const inputPath = path.join(directory, 'invalid.json');
    await writeFile(inputPath, '{not json', 'utf8');
    const fake = repository();

    await expect(reconcileFile({ inputPath, repository: fake })).rejects.toThrow('Invalid JSON');
    expect(fake.findExisting).not.toHaveBeenCalled();
    expect(fake.apply).not.toHaveBeenCalled();
  });

  it('reads, validates, and reconciles a plain array', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'car-finder-reconcile-'));
    const inputPath = path.join(directory, 'raw.json');
    await writeFile(inputPath, JSON.stringify([{
      id: 'one',
      title: 'Toyota Corolla',
      price: { amount: 10_000, currency: 'EUR' },
      type_attributes: { brand: 'Toyota', model: 'Corolla' },
      web_slug: 'toyota-corolla-one',
    }]), 'utf8');
    const fake = repository();

    const summary = await reconcileFile({ inputPath, repository: fake });

    expect(summary).toMatchObject({ total: 1, created: 1 });
    expect(fake.apply).toHaveBeenCalledOnce();
  });
});
