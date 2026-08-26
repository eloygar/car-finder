import { describe, expect, it } from 'vitest';

import { mapRawWallapopItem } from '../src/wallapop/WallapopMapper.js';

function currentPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-1',
    title: '  Toyota C-HR  ',
    description: '  Well maintained  ',
    price: { amount: 20_900, currency: 'EUR' },
    type_attributes: {
      brand: 'Toyota',
      model: 'C-HR',
      year: 2019,
      km: 62_500,
      engine: 'Electric',
      horsepower: 122,
      gear_box: 'Automatic',
      body_type: 'SUV',
    },
    location: {
      latitude: 40.35,
      longitude: -3.82,
      city: 'Alcorcón',
      region: 'Comunidad de Madrid',
      region2: 'Madrid',
    },
    images: [
      { urls: { small: 'small.jpg', medium: 'medium.jpg', big: 'big.jpg' } },
      { urls: { small: 'fallback.jpg' } },
    ],
    created_at: 1_773_360_104_037,
    web_slug: 'toyota-c-hr-123',
    ...overrides,
  };
}

describe('mapRawWallapopItem', () => {
  it('maps the current flat search payload without mutating the raw object', () => {
    const raw = currentPayload();

    const listing = mapRawWallapopItem(raw);

    expect(listing).toMatchObject({
      externalId: 'listing-1',
      provider: 'wallapop',
      title: 'Toyota C-HR',
      description: 'Well maintained',
      price: '20900.00',
      brand: 'Toyota',
      model: 'C-HR',
      year: 2019,
      mileage: 62_500,
      fuelType: 'electric',
      transmission: 'automatic',
      power: 122,
      bodyType: 'suv',
      province: 'Madrid',
      latitude: 40.35,
      longitude: -3.82,
      url: 'https://wallapop.com/item/toyota-c-hr-123',
      images: ['big.jpg', 'fallback.jpg'],
      publishedAt: new Date(1_773_360_104_037),
      sellerType: null,
      sellerName: null,
    });
    expect(listing.rawPayload).toBe(raw);
  });

  it('accepts legacy nested attributes, detail price, aliases, and original text fields', () => {
    const listing = mapRawWallapopItem({
      id: 'legacy-1',
      title: { original: 'Volkswagen Crafter' },
      description: { original: 'Work van' },
      price: { cash: { amount: '20000', currency: 'eur' } },
      type_attributes: {
        brand: { value: 'Volkswagen' },
        model: { value: 'Crafter' },
        year: { value: '2017' },
        km: { value: '320000' },
        engine: { value: 'Gasoil' },
        horse_power: { value: '102.0' },
      },
      location: { region: 'Galicia' },
      images: [{ urls: { medium: 'medium.jpg' } }],
      creation_date: 1_700_000_000,
      share_url: 'https://wallapop.com/item/volkswagen-crafter-123',
      user: { type: 'professional', micro_name: 'Dealer' },
    });

    expect(listing).toMatchObject({
      price: '20000.00',
      brand: 'Volkswagen',
      model: 'Crafter',
      year: 2017,
      mileage: 320_000,
      fuelType: 'gasoil',
      power: 102,
      province: 'Galicia',
      images: ['medium.jpg'],
      publishedAt: new Date(1_700_000_000_000),
      sellerType: 'professional',
      sellerName: 'Dealer',
    });
  });

  it('returns null or empty values for malformed optional fields', () => {
    const listing = mapRawWallapopItem(currentPayload({
      description: '',
      location: { latitude: 100, longitude: -200 },
      images: 'not-an-array',
      created_at: 'not-a-date',
    }));

    expect(listing).toMatchObject({
      description: null,
      latitude: null,
      longitude: null,
      images: [],
      publishedAt: null,
    });
  });

  it.each([
    ['id', { id: '' }],
    ['title', { title: null }],
    ['price', { price: { amount: -1, currency: 'EUR' } }],
    ['currency', { price: { amount: 10, currency: 'USD' } }],
    ['brand', { type_attributes: { model: 'C-HR' } }],
    ['model', { type_attributes: { brand: 'Toyota' } }],
    ['slug', { web_slug: undefined, share_url: undefined }],
  ])('rejects a listing with invalid required %s data', (_label, override) => {
    expect(() => mapRawWallapopItem(currentPayload(override))).toThrow();
  });

  it.each([
    ['TOYOTA', 'Toyota'],
    ['toyota', 'Toyota'],
    ['  toyota  ', 'Toyota'],
    ['seat', 'SEAT'],
    ['Bmw', 'BMW'],
    ['PeuGeot', 'Peugeot'],
    ['UnknownBrand', 'UnknownBrand'],
  ])('normalizes brand casing for "%s" to "%s"', (raw, expected) => {
    const listing = mapRawWallapopItem(currentPayload({
      type_attributes: { brand: raw, model: 'C-HR' },
    }));
    expect(listing.brand).toBe(expected);
  });
});
