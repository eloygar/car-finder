import { describe, expect, it, vi } from 'vitest';

import { calculateContentHash } from '../src/reconcile/contentHash.js';
import { reconcileListings } from '../src/reconcile/reconcileListings.js';
import type {
  ExistingListingState,
  ReconciliationAction,
  ReconciliationRepository,
} from '../src/reconcile/types.js';
import { mapRawWallapopItem } from '../src/wallapop/WallapopMapper.js';

function raw(id: string, title = `Car ${id}`) {
  return {
    id,
    title,
    description: 'Description',
    price: { amount: 10_000, currency: 'EUR' },
    type_attributes: { brand: 'Toyota', model: 'Corolla', year: 2020 },
    web_slug: `car-${id}`,
  };
}

function hash(item: ReturnType<typeof raw>): string {
  return calculateContentHash(mapRawWallapopItem(item));
}

function fakeRepository(existing: ExistingListingState[] = []) {
  const findExisting = vi.fn().mockResolvedValue(existing);
  const apply = vi.fn().mockResolvedValue(undefined);
  return {
    repository: { findExisting, apply } satisfies ReconciliationRepository,
    findExisting,
    apply,
  };
}

describe('reconcileListings', () => {
  it('classifies new, changed, unchanged, and reactivated records', async () => {
    const newItem = raw('new');
    const changedItem = raw('changed', 'New title');
    const unchangedItem = raw('unchanged');
    const reactivatedItem = raw('reactivated');
    const { repository, apply } = fakeRepository([
      { externalId: 'changed', contentHash: hash(raw('changed', 'Old title')), status: 'active' },
      { externalId: 'unchanged', contentHash: hash(unchangedItem), status: 'active' },
      { externalId: 'reactivated', contentHash: hash(reactivatedItem), status: 'unavailable' },
    ]);
    const seenAt = new Date('2026-08-25T12:00:00Z');

    const summary = await reconcileListings({
      rawItems: [newItem, changedItem, unchangedItem, reactivatedItem],
      repository,
      seenAt,
    });

    expect(summary).toEqual({
      total: 4,
      created: 1,
      changed: 1,
      unchanged: 2,
      reactivated: 1,
      dryRun: false,
    });
    expect(apply).toHaveBeenCalledOnce();
    const [actions, appliedAt] = apply.mock.calls[0] as [ReconciliationAction[], Date];
    expect(appliedAt).toEqual(seenAt);
    expect(actions.map((action) => action.kind)).toEqual(['create', 'update', 'update', 'update']);
    expect(actions[1]).toMatchObject({ kind: 'update', classificationChanged: true });
    expect(actions[2]).toMatchObject({ kind: 'update', classificationChanged: false });
  });

  it('compares but does not write in dry-run mode', async () => {
    const { repository, findExisting, apply } = fakeRepository();

    const summary = await reconcileListings({ rawItems: [raw('1')], repository, dryRun: true });

    expect(summary).toMatchObject({ created: 1, dryRun: true });
    expect(findExisting).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  it('validates every item and duplicate before accessing the repository', async () => {
    const { repository, findExisting, apply } = fakeRepository();

    await expect(
      reconcileListings({ rawItems: [raw('same'), raw('same')], repository }),
    ).rejects.toThrow('Duplicate externalId');
    await expect(
      reconcileListings({ rawItems: [raw('valid'), { id: 'invalid' }], repository }),
    ).rejects.toThrow('Invalid listing at index 1');

    expect(findExisting).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects a non-array input without querying the database', async () => {
    const { repository, findExisting } = fakeRepository();
    await expect(reconcileListings({ rawItems: {}, repository })).rejects.toThrow('JSON array');
    expect(findExisting).not.toHaveBeenCalled();
  });

  it('does not infer unavailable listings that are absent from the input', async () => {
    const { repository, apply } = fakeRepository([
      { externalId: 'present', contentHash: hash(raw('present')), status: 'active' },
    ]);

    await reconcileListings({ rawItems: [raw('present')], repository });

    const [actions] = apply.mock.calls[0] as [ReconciliationAction[]];
    expect(actions).toHaveLength(1);
    expect(actions[0]?.listing.externalId).toBe('present');
  });

  it('propagates transactional repository failures', async () => {
    const { repository, apply } = fakeRepository();
    apply.mockRejectedValueOnce(new Error('transaction rolled back'));

    await expect(reconcileListings({ rawItems: [raw('1')], repository })).rejects.toThrow(
      'transaction rolled back',
    );
  });
});
