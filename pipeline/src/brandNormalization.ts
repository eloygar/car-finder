import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAXONOMY_BRANDS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../docs/wallapop-car-taxonomy-capture.json',
);

let lowerToCanonical: Map<string, string> | undefined;

function loadCanonicalBrands(): Map<string, string> {
  if (lowerToCanonical) {
    return lowerToCanonical;
  }
  const map = new Map<string, string>();
  try {
    const taxonomy = JSON.parse(readFileSync(TAXONOMY_BRANDS_PATH, 'utf8')) as {
      brands?: string[];
    };
    for (const brand of taxonomy.brands ?? []) {
      const key = brand.trim().toLowerCase();
      if (key.length > 0) {
        map.set(key, brand);
      }
    }
  } catch {
    // Ignore: fall back to case normalization below.
  }
  lowerToCanonical = map;
  return map;
}

function toTitleCase(value: string): string {
  return value
    .split(/(\s+)/)
    .map((word) => {
      if (word.trim().length === 0) {
        return word;
      }
      const isAllUpper = word !== word.toLowerCase() && word === word.toUpperCase();
      const isAllLower = word !== word.toUpperCase() && word === word.toLowerCase();
      if (!isAllUpper && !isAllLower) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}

export function normalizeBrand(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const canonical = loadCanonicalBrands().get(trimmed.toLowerCase());
  if (canonical) {
    return canonical;
  }
  return toTitleCase(trimmed);
}
