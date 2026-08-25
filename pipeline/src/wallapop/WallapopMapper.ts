import type { MappedListing } from '../reconcile/types.js';

const WALLAPOP_ITEM_BASE_URL = 'https://wallapop.com/item/';

export function mapRawWallapopItem(raw: unknown): MappedListing {
  const item = requireRecord(raw, 'listing');
  const attributes = optionalRecord(item.type_attributes) ?? {};
  const location = optionalRecord(item.location);

  const externalId = requireString(item.id, 'id');
  const title = requireOriginalString(item.title, 'title');
  const description = optionalOriginalString(item.description);
  const { amount: price, currency } = readPrice(item.price);
  if (currency.toUpperCase() !== 'EUR') {
    throw new Error(`Listing ${externalId}: unsupported price currency "${currency}"`);
  }

  const brand = requireAttributeString(attributes, ['brand'], 'brand', externalId);
  const model = requireAttributeString(attributes, ['model'], 'model', externalId);

  return {
    externalId,
    provider: 'wallapop',
    title,
    description,
    price,
    brand,
    model,
    year: readAttributeInteger(attributes, ['year']),
    mileage: readAttributeInteger(attributes, ['km', 'mileage']),
    fuelType: normalizeCategory(readAttributeString(attributes, ['engine', 'fuel_type'])),
    transmission: normalizeCategory(
      readAttributeString(attributes, ['gear_box', 'gearbox', 'transmission']),
    ),
    power: readAttributeInteger(attributes, ['horsepower', 'horse_power', 'power']),
    bodyType: normalizeCategory(readAttributeString(attributes, ['body_type', 'bodyType'])),
    province: optionalString(location?.region2) ?? optionalString(location?.region),
    latitude: readCoordinate(location?.latitude, -90, 90),
    longitude: readCoordinate(location?.longitude, -180, 180),
    url: readListingUrl(item, externalId),
    images: readImages(item.images),
    publishedAt: readTimestamp(item.created_at ?? item.creation_date),
    sellerType: optionalString(optionalRecord(item.user)?.type),
    sellerName: optionalString(optionalRecord(item.user)?.micro_name),
    rawPayload: item,
  };
}

function readPrice(value: unknown): { amount: string; currency: string } {
  const price = requireRecord(value, 'price');
  const cash = optionalRecord(price.cash);
  const rawAmount = cash?.amount ?? price.amount;
  const rawCurrency = cash?.currency ?? price.currency;
  const amount = toFiniteNumber(rawAmount);
  const currency = requireString(rawCurrency, 'price.currency');

  if (amount === undefined || amount < 0 || amount > 9_999_999_999.99) {
    throw new Error('Invalid listing price');
  }

  return { amount: amount.toFixed(2), currency };
}

function readListingUrl(item: Record<string, unknown>, externalId: string): string {
  const shareUrl = optionalString(item.share_url);
  if (shareUrl) {
    try {
      const parsed = new URL(shareUrl);
      if (
        parsed.protocol === 'https:'
        && (parsed.hostname === 'wallapop.com' || parsed.hostname.endsWith('.wallapop.com'))
      ) {
        return parsed.toString();
      }
    } catch {
      // Fall through to the required slug.
    }
  }

  const slug = optionalString(item.web_slug) ?? optionalString(item.slug);
  if (!slug || slug.includes('/') || slug.includes('..')) {
    throw new Error(`Listing ${externalId}: missing valid URL slug`);
  }
  return `${WALLAPOP_ITEM_BASE_URL}${encodeURIComponent(slug)}`;
}

function readImages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const urls: string[] = [];
  for (const image of value) {
    const urlMap = optionalRecord(optionalRecord(image)?.urls);
    const url = optionalString(urlMap?.big)
      ?? optionalString(urlMap?.medium)
      ?? optionalString(urlMap?.small);
    if (url) {
      urls.push(url);
    }
  }
  return urls;
}

function readTimestamp(value: unknown): Date | null {
  const number = toFiniteNumber(value);
  if (number === undefined || number < 0) {
    return null;
  }
  const milliseconds = number < 1_000_000_000_000 ? number * 1_000 : number;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const number = toFiniteNumber(value);
  return number !== undefined && number >= minimum && number <= maximum ? number : null;
}

function requireAttributeString(
  attributes: Record<string, unknown>,
  keys: readonly string[],
  label: string,
  externalId: string,
): string {
  const value = readAttributeString(attributes, keys);
  if (!value) {
    throw new Error(`Listing ${externalId}: missing ${label}`);
  }
  return value;
}

function readAttributeString(
  attributes: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = unwrapAttribute(attributes[key]);
    const string = optionalString(value);
    if (string) {
      return string;
    }
  }
  return null;
}

function readAttributeInteger(
  attributes: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const number = toFiniteNumber(unwrapAttribute(attributes[key]));
    if (number !== undefined && number >= 0) {
      return Math.trunc(number);
    }
  }
  return null;
}

function unwrapAttribute(value: unknown): unknown {
  return optionalRecord(value)?.value ?? value;
}

function normalizeCategory(value: string | null): string | null {
  return value?.toLocaleLowerCase('es-ES') ?? null;
}

function requireOriginalString(value: unknown, label: string): string {
  const original = optionalRecord(value)?.original ?? value;
  return requireString(original, label);
}

function optionalOriginalString(value: unknown): string | null {
  return optionalString(optionalRecord(value)?.original ?? value);
}

function requireString(value: unknown, label: string): string {
  const string = optionalString(value);
  if (!string) {
    throw new Error(`Missing or invalid ${label}`);
  }
  return string;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return undefined;
  }
  const number = typeof value === 'number' ? value : Number(value.trim());
  return Number.isFinite(number) ? number : undefined;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new Error(`Missing or invalid ${label}`);
  }
  return record;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
