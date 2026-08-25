import type { Prisma } from '../../../prisma/generated/client/client.js';
import type { DatabaseClient } from '../db/client.js';
import type {
  ExistingListingState,
  MappedListing,
  ReconciliationAction,
  ReconciliationRepository,
} from './types.js';

export class PrismaListingRepository implements ReconciliationRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findExisting(externalIds: readonly string[]): Promise<ExistingListingState[]> {
    if (externalIds.length === 0) {
      return [];
    }

    return this.prisma.listing.findMany({
      where: {
        provider: 'wallapop',
        externalId: { in: [...externalIds] },
      },
      select: {
        externalId: true,
        contentHash: true,
        status: true,
      },
    });
  }

  async apply(actions: readonly ReconciliationAction[], seenAt: Date): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        for (const action of actions) {
          const data = toBaseData(action.listing);
          if (action.kind === 'create') {
            await transaction.listing.create({
              data: {
                ...data,
                contentHash: action.listing.contentHash,
                status: 'active',
                firstSeenAt: seenAt,
                lastSeenAt: seenAt,
              },
            });
            continue;
          }

          await transaction.listing.update({
            where: {
              provider_externalId: {
                provider: action.listing.provider,
                externalId: action.listing.externalId,
              },
            },
            data: {
              ...data,
              contentHash: action.listing.contentHash,
              status: 'active',
              lastSeenAt: seenAt,
              ...(action.classificationChanged ? clearedClassification() : {}),
            },
          });
        }
      },
      { timeout: 60_000 },
    );
  }
}

function toBaseData(listing: MappedListing) {
  return {
    externalId: listing.externalId,
    provider: listing.provider,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    brand: listing.brand,
    model: listing.model,
    year: listing.year,
    mileage: listing.mileage,
    fuelType: listing.fuelType,
    transmission: listing.transmission,
    power: listing.power,
    bodyType: listing.bodyType,
    province: listing.province,
    latitude: listing.latitude,
    longitude: listing.longitude,
    url: listing.url,
    images: listing.images,
    publishedAt: listing.publishedAt,
    sellerType: listing.sellerType,
    sellerName: listing.sellerName,
    rawPayload: listing.rawPayload as Prisma.InputJsonValue,
  };
}

function clearedClassification() {
  return {
    isDamaged: null,
    damageConfidence: null,
    repairCostEstimate: null,
    repairCostReasoning: null,
    knownIssues: null,
    knownIssuesDetail: null,
    classificationVersion: null,
    classifiedAt: null,
  } as const;
}
