import type { RawWallapopItem } from '../../../pipeline/src/wallapop/types.js';
import type { LocalSearchRequest, SearchResultItem } from './types.js';

export function filterRawListings(
  items: readonly RawWallapopItem[],
  filters: LocalSearchRequest,
): RawWallapopItem[] {
  return items.filter((item) => {
    const attributes = record(item.type_attributes) ?? {};
    return matchesText(attribute(attributes, 'model'), filters.model)
      && matchesRange(priceAmount(item.price), filters.price)
      && matchesRange(numeric(attribute(attributes, 'year')), filters.year)
      && matchesRange(numeric(attribute(attributes, 'km')), filters.mileage);
  });
}

export function toSearchResultItem(item: RawWallapopItem): SearchResultItem {
  const attributes = record(item.type_attributes) ?? {};
  const price = record(item.price);
  const location = record(item.location);
  const slug = text(item.web_slug) ?? text(item.slug);

  return {
    id: item.id,
    title: text(item.title) ?? 'Anuncio sin título',
    price: priceAmount(price),
    currency: text(price?.currency) ?? 'EUR',
    brand: stringAttribute(attributes, 'brand'),
    model: stringAttribute(attributes, 'model'),
    year: numeric(attribute(attributes, 'year')),
    mileage: numeric(attribute(attributes, 'km')),
    location: text(location?.city) ?? text(location?.region2),
    imageUrl: largestImage(item.images),
    url: text(item.share_url) ?? (slug ? `https://wallapop.com/item/${slug}` : null),
  };
}

function matchesText(value: unknown, expected?: string): boolean {
  if (!expected) return true;
  return typeof value === 'string' && value.localeCompare(expected, undefined, {
    sensitivity: 'accent',
  }) === 0;
}

function matchesRange(
  value: number | null,
  range?: { min?: number; max?: number },
): boolean {
  if (!range || (range.min === undefined && range.max === undefined)) return true;
  if (value === null) return false;
  return (range.min === undefined || value >= range.min)
    && (range.max === undefined || value <= range.max);
}

function attribute(attributes: Record<string, unknown>, key: string): unknown {
  const value = attributes[key];
  const nested = record(value);
  return nested && 'value' in nested ? nested.value : value;
}

function stringAttribute(attributes: Record<string, unknown>, key: string): string | null {
  return text(attribute(attributes, key));
}

function priceAmount(value: unknown): number | null {
  const price = record(value);
  return numeric(price?.amount) ?? numeric(record(price?.cash)?.amount);
}

function largestImage(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const image of value) {
    const urls = record(record(image)?.urls);
    const candidate = text(urls?.big) ?? text(urls?.medium) ?? text(urls?.small);
    if (candidate) return candidate;
  }
  return null;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
