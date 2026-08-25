import { createHash } from 'node:crypto';

import type { MappedListing } from './types.js';

export function calculateContentHash(listing: MappedListing): string {
  const classificationInput = JSON.stringify([
    listing.title,
    listing.description,
    listing.price,
    listing.brand,
    listing.model,
    listing.year,
  ]);

  return createHash('sha256').update(classificationInput, 'utf8').digest('hex');
}
