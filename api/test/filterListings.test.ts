import { describe, expect, it } from 'vitest';

import { filterRawListings, toSearchResultItem } from '../src/localSearch/filterListings.js';
import type { LocalSearchRequest } from '../src/localSearch/types.js';

const filters: LocalSearchRequest = {
  brand: 'Toyota',
  model: 'Corolla',
  locationId: 'madrid',
  distanceMeters: 50_000,
  engine: 'hybride',
  transmission: 'automatic',
  bodyType: 'sedan',
  price: { min: 10_000, max: 20_000 },
  year: { min: 2019, max: 2023 },
  mileage: { max: 100_000 },
  maxPages: 3,
};

const matching = {
  id: 'car-1',
  title: 'Toyota Corolla Hybrid',
  price: { amount: 15_500, currency: 'EUR' },
  type_attributes: {
    brand: 'Toyota',
    model: 'Corolla',
    engine: 'hybride',
    gear_box: 'automatic',
    body_type: 'sedan',
    year: 2021,
    km: 72_000,
  },
  location: { city: 'Madrid', region2: 'Comunidad de Madrid' },
  images: [{ urls: { medium: 'medium.jpg', big: 'big.jpg' } }],
  web_slug: 'toyota-corolla-car-1',
};

describe('local search listing filters', () => {
  it('applies model, taxonomy values, and numeric ranges', () => {
    const rejected = [
      { ...matching, id: 'wrong-model', type_attributes: { ...matching.type_attributes, model: 'Yaris' } },
      { ...matching, id: 'too-expensive', price: { amount: 30_000, currency: 'EUR' } },
      { ...matching, id: 'too-old', type_attributes: { ...matching.type_attributes, year: 2010 } },
      { ...matching, id: 'too-many-km', type_attributes: { ...matching.type_attributes, km: 150_000 } },
    ];

    expect(filterRawListings([matching, ...rejected], filters).map(({ id }) => id)).toEqual([
      'car-1',
    ]);
  });

  it('accepts legacy nested attributes and builds a compact result projection', () => {
    const legacy = {
      ...matching,
      type_attributes: Object.fromEntries(
        Object.entries(matching.type_attributes).map(([key, value]) => [key, { value }]),
      ),
    };

    expect(filterRawListings([legacy], filters)).toHaveLength(1);
    expect(toSearchResultItem(legacy)).toEqual({
      id: 'car-1',
      title: 'Toyota Corolla Hybrid',
      price: 15_500,
      currency: 'EUR',
      brand: 'Toyota',
      model: 'Corolla',
      year: 2021,
      mileage: 72_000,
      location: 'Madrid',
      imageUrl: 'big.jpg',
      url: 'https://wallapop.com/item/toyota-corolla-car-1',
    });
  });

  it('does not reject missing attributes when the matching filter is omitted', () => {
    const sparse = { id: 'sparse', title: 'Sparse listing' };
    expect(filterRawListings([sparse], {
      brand: 'Toyota',
      locationId: 'madrid',
      distanceMeters: 50_000,
      maxPages: 1,
    })).toEqual([sparse]);
  });
});
