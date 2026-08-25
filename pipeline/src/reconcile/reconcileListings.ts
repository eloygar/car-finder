import { calculateContentHash } from './contentHash.js';
import type {
  PreparedListing,
  ReconcileSummary,
  ReconciliationAction,
  ReconciliationRepository,
} from './types.js';
import { mapRawWallapopItem } from '../wallapop/WallapopMapper.js';

export async function reconcileListings(options: {
  rawItems: unknown;
  repository: ReconciliationRepository;
  dryRun?: boolean;
  seenAt?: Date;
}): Promise<ReconcileSummary> {
  const seenAt = options.seenAt ?? new Date();
  if (!Array.isArray(options.rawItems)) {
    throw new Error('Reconciliation input must be a JSON array');
  }

  const prepared = prepareListings(options.rawItems);
  const dryRun = options.dryRun ?? false;
  const summary: ReconcileSummary = {
    total: prepared.length,
    created: 0,
    changed: 0,
    unchanged: 0,
    reactivated: 0,
    dryRun,
  };

  if (prepared.length === 0) {
    return summary;
  }

  const existingRows = await options.repository.findExisting(
    prepared.map((listing) => listing.externalId),
  );
  const existingById = new Map(existingRows.map((listing) => [listing.externalId, listing]));
  const actions: ReconciliationAction[] = [];

  for (const listing of prepared) {
    const existing = existingById.get(listing.externalId);
    if (!existing) {
      summary.created += 1;
      actions.push({ kind: 'create', listing });
      continue;
    }

    const classificationChanged = existing.contentHash !== listing.contentHash;
    if (classificationChanged) {
      summary.changed += 1;
    } else {
      summary.unchanged += 1;
    }
    if (existing.status !== 'active') {
      summary.reactivated += 1;
    }
    actions.push({ kind: 'update', listing, classificationChanged });
  }

  if (!dryRun) {
    await options.repository.apply(actions, seenAt);
  }

  return summary;
}

function prepareListings(rawItems: readonly unknown[]): PreparedListing[] {
  const externalIds = new Set<string>();
  return rawItems.map((rawItem, index) => {
    let listing;
    try {
      listing = mapRawWallapopItem(rawItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid listing at index ${index}: ${message}`, { cause: error });
    }

    if (externalIds.has(listing.externalId)) {
      throw new Error(`Duplicate externalId "${listing.externalId}" at index ${index}`);
    }
    externalIds.add(listing.externalId);

    return { ...listing, contentHash: calculateContentHash(listing) };
  });
}
