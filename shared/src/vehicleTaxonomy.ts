import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAXONOMY_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../docs/wallapop-car-taxonomy-capture.json',
);

export interface VehicleTaxonomyIdentity {
  source: 'wallapop';
  brand: string;
  model: string;
  normalizedBrand: string;
  normalizedModel: string;
  taxonomyStatus: 'canonical' | 'provisional';
  taxonomySchemaVersion: number | null;
  taxonomyCapturedAt: Date | null;
  active: boolean;
}

export function vehicleModelIdentityUpdate(identity: VehicleTaxonomyIdentity): VehicleTaxonomyIdentity | {
  brand: string;
  model: string;
} {
  return identity.taxonomyStatus === 'canonical'
    ? identity
    : { brand: identity.brand, model: identity.model };
}

interface TaxonomySnapshot {
  schema_version?: number;
  captured_at?: string;
  brands?: string[];
  models?: Record<string, string[]>;
}

let cached: { snapshot: TaxonomySnapshot; identities: Map<string, VehicleTaxonomyIdentity> } | undefined;

export function normalizeTaxonomyLabel(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

export function loadCanonicalVehicleModels(): VehicleTaxonomyIdentity[] {
  return [...load().identities.values()];
}

export function resolveVehicleModelIdentity(brand: string, model: string): VehicleTaxonomyIdentity {
  const normalizedBrand = normalizeTaxonomyLabel(brand);
  const normalizedModel = normalizeTaxonomyLabel(model);
  const canonical = load().identities.get(identityKey(normalizedBrand, normalizedModel));
  if (canonical) return canonical;
  return {
    source: 'wallapop',
    brand: brand.trim(),
    model: model.trim(),
    normalizedBrand,
    normalizedModel,
    taxonomyStatus: 'provisional',
    taxonomySchemaVersion: null,
    taxonomyCapturedAt: null,
    active: true,
  };
}

function load() {
  if (cached) return cached;
  const snapshot = JSON.parse(readFileSync(TAXONOMY_PATH, 'utf8')) as TaxonomySnapshot;
  const identities = new Map<string, VehicleTaxonomyIdentity>();
  const capturedAt = snapshot.captured_at ? new Date(snapshot.captured_at) : null;
  for (const brand of snapshot.brands ?? []) {
    for (const model of snapshot.models?.[brand] ?? []) {
      const normalizedBrand = normalizeTaxonomyLabel(brand);
      const normalizedModel = normalizeTaxonomyLabel(model);
      identities.set(identityKey(normalizedBrand, normalizedModel), {
        source: 'wallapop', brand, model, normalizedBrand, normalizedModel,
        taxonomyStatus: 'canonical',
        taxonomySchemaVersion: snapshot.schema_version ?? null,
        taxonomyCapturedAt: capturedAt,
        active: true,
      });
    }
  }
  cached = { snapshot, identities };
  return cached;
}

function identityKey(brand: string, model: string): string {
  return `${brand}\u0000${model}`;
}
