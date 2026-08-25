import { describe, expect, it } from 'vitest';

import { calculateContentHash } from '../src/reconcile/contentHash.js';
import type { MappedListing } from '../src/reconcile/types.js';

function listing(overrides: Partial<MappedListing> = {}): MappedListing {
  return {
    externalId: '1',
    provider: 'wallapop',
    title: 'Toyota C-HR',
    description: 'Description',
    price: '20000.00',
    brand: 'Toyota',
    model: 'C-HR',
    year: 2019,
    mileage: 50_000,
    fuelType: 'hybrid',
    transmission: 'automatic',
    power: 122,
    bodyType: 'suv',
    province: 'Madrid',
    latitude: 40.4,
    longitude: -3.7,
    url: 'https://wallapop.com/item/example',
    images: ['one.jpg'],
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    sellerType: null,
    sellerName: null,
    rawPayload: { id: '1' },
    ...overrides,
  };
}

describe('calculateContentHash', () => {
  it('is deterministic', () => {
    expect(calculateContentHash(listing())).toBe(calculateContentHash(listing()));
    expect(calculateContentHash(listing())).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ['title', 'Changed title'],
    ['description', 'Changed description'],
    ['price', '19999.99'],
    ['brand', 'Honda'],
    ['model', 'Corolla'],
    ['year', 2020],
  ] as const)('changes when AI input %s changes', (field, value) => {
    expect(calculateContentHash(listing({ [field]: value }))).not.toBe(
      calculateContentHash(listing()),
    );
  });

  it.each([
    ['mileage', 60_000],
    ['province', 'Barcelona'],
    ['images', ['two.jpg']],
    ['location', undefined],
  ] as const)('does not change for non-AI field %s', (field, value) => {
    const overrides = field === 'location' ? { latitude: null, longitude: null } : { [field]: value };
    expect(calculateContentHash(listing(overrides))).toBe(calculateContentHash(listing()));
  });
});
