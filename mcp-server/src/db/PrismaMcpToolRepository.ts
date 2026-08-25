import type { DatabaseClient } from '../../../shared/src/db/client.js';
import type {
  KnownIssueRecord,
  McpToolRepository,
  VehicleQuery,
} from '../tools/types.js';

export class PrismaMcpToolRepository implements McpToolRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findKnownIssues(query: VehicleQuery): Promise<KnownIssueRecord[]> {
    return this.prisma.knownIssue.findMany({
      where: {
        brand: { equals: query.brand, mode: 'insensitive' },
        model: { equals: query.model, mode: 'insensitive' },
        ...(query.year === undefined ? {} : {
          AND: [
            { OR: [{ yearFrom: null }, { yearFrom: { lte: query.year } }] },
            { OR: [{ yearTo: null }, { yearTo: { gte: query.year } }] },
          ],
        }),
      },
      select: {
        id: true,
        issueDescription: true,
        severity: true,
        yearFrom: true,
        yearTo: true,
        source: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async findComparablePrices(query: VehicleQuery): Promise<string[]> {
    const rows = await this.prisma.listing.findMany({
      where: {
        status: 'active',
        brand: { equals: query.brand, mode: 'insensitive' },
        model: { equals: query.model, mode: 'insensitive' },
        price: { gt: 0 },
        ...(query.year === undefined ? {} : {
          year: { gte: query.year - 1, lte: query.year + 1 },
        }),
      },
      select: { price: true },
    });

    return rows.map(({ price }) => price.toFixed(2));
  }
}
