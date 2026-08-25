import { Prisma } from '../../../prisma/generated/client/client.js';
import type { ListingClassification } from '../../../shared/src/classification/ListingClassification.js';
import type { DatabaseClient } from '../db/client.js';
import type {
  ClassificationCandidate,
  ClassificationRepository,
  ClassificationRunOptions,
} from './types.js';

export class PrismaClassificationRepository implements ClassificationRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findCandidates(
    options: ClassificationRunOptions,
    version: string,
  ): Promise<ClassificationCandidate[]> {
    const rows = await this.prisma.listing.findMany({
      where: {
        status: 'active',
        ...(options.only ? { externalId: options.only } : {}),
        ...(!options.force ? {
          OR: [
            { classifiedAt: null },
            { classificationVersion: null },
            { classificationVersion: { not: version } },
          ],
        } : {}),
      },
      orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
      ...(!options.all && !options.only ? { take: options.limit ?? 10 } : {}),
      select: {
        id: true,
        externalId: true,
        contentHash: true,
        title: true,
        description: true,
        price: true,
        brand: true,
        model: true,
        year: true,
        mileage: true,
        fuelType: true,
        transmission: true,
        bodyType: true,
        images: true,
      },
    });

    return rows.map((row) => ({ ...row, price: row.price.toFixed(2) }));
  }

  async saveClassification(options: {
    id: string;
    contentHash: string;
    classification: ListingClassification;
    version: string;
    classifiedAt: Date;
  }): Promise<boolean> {
    const result = await this.prisma.listing.updateMany({
      where: {
        id: options.id,
        contentHash: options.contentHash,
        status: 'active',
      },
      data: {
        classification: options.classification as Prisma.InputJsonValue,
        classificationVersion: options.version,
        classifiedAt: options.classifiedAt,
      },
    });
    return result.count === 1;
  }
}
