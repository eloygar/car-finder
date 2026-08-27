import type { Prisma } from '../../../prisma/generated/client/client.js';

export function classifiedListingWhere(vehicleModelId?: string): Prisma.ListingWhereInput {
  return {
    status: 'active',
    classifiedAt: { not: null },
    ...(vehicleModelId ? { vehicleModelId } : {}),
    OR: [
      { classification: { path: ['operability', 'status'], equals: 'operational' } },
      { classification: { path: ['operability', 'status'], equals: 'unknown' } },
      { classification: { path: ['status'], equals: 'operational' } },
      { classification: { path: ['status'], equals: 'unknown' } },
    ],
  };
}
