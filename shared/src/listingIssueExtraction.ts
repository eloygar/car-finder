import { createHash } from 'node:crypto';

import { normalizeTaxonomyLabel } from './vehicleTaxonomy.js';

export function listingIssueInputHash(options: {
  description: string;
  brand: string;
  model: string;
  year: number | null;
}): string {
  return createHash('sha256').update(JSON.stringify({
    description: options.description,
    brand: normalizeTaxonomyLabel(options.brand),
    model: normalizeTaxonomyLabel(options.model),
    year: options.year,
  }), 'utf8').digest('hex');
}
