import { describe, expect, it } from 'vitest';
import { normalizeTaxonomyLabel, resolveVehicleModelIdentity } from './vehicleTaxonomy.js';

describe('vehicle taxonomy identity', () => {
  it('normalizes spacing and case and resolves exact taxonomy pairs as canonical', () => {
    expect(normalizeTaxonomyLabel('  TOYOTA   Corolla ')).toBe('toyota corolla');
    expect(resolveVehicleModelIdentity(' toyota ', ' COROLLA ')).toMatchObject({
      source: 'wallapop', brand: 'Toyota', model: 'Corolla', taxonomyStatus: 'canonical', active: true,
    });
  });

  it('creates an explicit provisional identity without fuzzy matching', () => {
    expect(resolveVehicleModelIdentity('Imaginary Motors', 'Almost Corolla')).toMatchObject({
      normalizedBrand: 'imaginary motors', normalizedModel: 'almost corolla',
      taxonomyStatus: 'provisional', taxonomySchemaVersion: null,
    });
  });
});
