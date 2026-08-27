import { Prisma } from '../../../prisma/generated/client/client.js';
import type { ListingClassification } from '../../../shared/src/classification/ListingClassification.js';
import type { DatabaseClient } from '../db/client.js';
import type {
  ClassificationCandidate,
  ClassificationRepository,
  ClassificationRunOptions,
} from './types.js';
import type {
  KnownIssuesWebAnalysis,
  VehicleQuery,
} from '../../../mcp-server/src/tools/types.js';

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

  async findStoredKnownIssues(query: VehicleQuery): Promise<KnownIssuesWebAnalysis> {
    const brand = query.brand.trim();
    const model = query.model.trim();
    const rows = await this.prisma.knownIssue.findMany({
      where: {
        brand: { equals: brand, mode: 'insensitive' },
        model: { equals: model, mode: 'insensitive' },
        ...(query.year === undefined ? {} : {
          AND: [
            { OR: [{ yearFrom: null }, { yearFrom: { lte: query.year } }] },
            { OR: [{ yearTo: null }, { yearTo: { gte: query.year } }] },
          ],
        }),
      },
      select: {
        issueDescription: true,
        category: true,
        severity: true,
        yearFrom: true,
        yearTo: true,
        source: true,
      },
      orderBy: { id: 'asc' },
    });

    const issues = rows.map((row) => ({
      description: row.issueDescription,
      category: row.category as 'mecanica' | 'chapa' | 'interior' | 'otros',
      severity: normalizeSeverity(row.severity),
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
      source: row.source,
    }));

    if (issues.length === 0) {
      return { found: false, summary: '', sources: [], issues: [] };
    }

    const counts = { mecanica: 0, chapa: 0, interior: 0, otros: 0 };
    for (const issue of issues) counts[issue.category] += 1;
    const breakdown = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => `${count} ${category}`)
      .join(', ');

    const summary = `Se han registrado ${issues.length} problemas conocidos (${breakdown}).`;
    const sources = [
      ...new Set(issues.map((issue) => issue.source).filter((source): source is string => source !== null)),
    ].map((url) => ({ title: url, url }));

    return { found: true, summary, sources, issues };
  }
}

function normalizeSeverity(value: string): 'low' | 'medium' | 'high' | 'unknown' {
  const normalized = value.trim().toLowerCase();
  return normalized === 'low' || normalized === 'medium' || normalized === 'high'
    ? normalized
    : 'unknown';
}
