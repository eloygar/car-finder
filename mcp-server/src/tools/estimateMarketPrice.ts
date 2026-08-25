import { Prisma } from '../../../prisma/generated/client/client.js';

import type {
  EstimateMarketPriceResult,
  MarketPriceFilters,
  McpToolRepository,
  VehicleQuery,
} from './types.js';

const MINIMUM_SAMPLE_SIZE = 3;

export async function estimateMarketPrice(
  query: VehicleQuery,
  repository: McpToolRepository,
): Promise<EstimateMarketPriceResult> {
  const normalized = normalizeQuery(query);
  const priceStrings = await repository.findComparablePrices(normalized);
  const filters = toFilters(normalized);

  if (priceStrings.length < MINIMUM_SAMPLE_SIZE) {
    return {
      status: 'insufficient_data',
      currency: 'EUR',
      sampleSize: priceStrings.length,
      requiredSampleSize: MINIMUM_SAMPLE_SIZE,
      filters,
    };
  }

  const prices = priceStrings
    .map((price) => new Prisma.Decimal(price))
    .sort((left, right) => left.comparedTo(right));
  const total = prices.reduce(
    (sum, price) => sum.plus(price),
    new Prisma.Decimal(0),
  );
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0
    ? prices[middle - 1]!.plus(prices[middle]!).dividedBy(2)
    : prices[middle]!;

  return {
    status: 'ok',
    currency: 'EUR',
    sampleSize: prices.length,
    filters,
    average: money(total.dividedBy(prices.length)),
    median: money(median),
    minimum: money(prices[0]!),
    maximum: money(prices.at(-1)!),
  };
}

function normalizeQuery(query: VehicleQuery): VehicleQuery {
  return {
    brand: query.brand.trim(),
    model: query.model.trim(),
    ...(query.year === undefined ? {} : { year: query.year }),
  };
}

function toFilters(query: VehicleQuery): MarketPriceFilters {
  return {
    brand: query.brand,
    model: query.model,
    yearWindow: query.year === undefined
      ? null
      : { from: query.year - 1, to: query.year + 1 },
  };
}

function money(value: InstanceType<typeof Prisma.Decimal>): string {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}
