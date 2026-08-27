import { createHash } from 'node:crypto';

import type { DatabaseClient } from '../../../shared/src/db/client.js';
import type {
  IssueCategory,
  KnownIssuesSaveResult,
  KnownIssuesStore,
  KnownIssuesWebAnalysis,
  ResearchedIssue,
  VehicleQuery,
} from '../tools/types.js';

function slugify(brand: string, model: string): string {
  return `${brand}-${model}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '-');
}

function issueContentHash(
  vehicleModelId: string,
  brand: string,
  model: string,
  issue: ResearchedIssue,
): string {
  return createHash('sha1')
    .update(
      [
        vehicleModelId,
        brand,
        model,
        issue.category,
        issue.description,
        issue.severity,
        issue.yearFrom ?? '',
        issue.yearTo ?? '',
        issue.source ?? '',
      ].join('|'),
    )
    .digest('hex');
}

function normalizeSeverity(value: string): ResearchedIssue['severity'] {
  const normalized = value.trim().toLowerCase();
  return normalized === 'low' || normalized === 'medium' || normalized === 'high'
    ? normalized
    : 'unknown';
}

export class PrismaKnownIssuesStore implements KnownIssuesStore {
  constructor(private readonly prisma: DatabaseClient) {}

  async findByModel(query: VehicleQuery): Promise<KnownIssuesWebAnalysis | null> {
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

    if (rows.length === 0) return null;

    const issues: ResearchedIssue[] = rows.map((row) => ({
      description: row.issueDescription,
      category: row.category as IssueCategory,
      severity: normalizeSeverity(row.severity),
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
      source: row.source,
    }));

    const counts = {
      mecanica: 0,
      chapa: 0,
      interior: 0,
      otros: 0,
    };
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

  async saveResearchedIssues(
    query: VehicleQuery,
    issues: ResearchedIssue[],
  ): Promise<KnownIssuesSaveResult> {
    const brand = query.brand.trim();
    const model = query.model.trim();

    const vehicleModel = await this.prisma.vehicleModel.upsert({
      where: { brand_name: { brand, name: model } },
      create: { brand, name: model, slug: slugify(brand, model) },
      update: {},
      select: { id: true },
    });

    const contentHashes = issues.map((issue) =>
      issueContentHash(vehicleModel.id, brand, model, issue),
    );
    const existingHashes = new Set(
      (
        await this.prisma.knownIssue.findMany({
          where: {
            vehicleModelId: vehicleModel.id,
            contentHash: { in: contentHashes },
          },
          select: { contentHash: true },
        })
      ).map((row) => row.contentHash),
    );

    let created = 0;
    let updated = 0;

    for (const issue of issues) {
      const contentHash = issueContentHash(vehicleModel.id, brand, model, issue);
      const data = {
        vehicleModelId: vehicleModel.id,
        brand,
        model,
        issueDescription: issue.description,
        category: issue.category,
        severity: issue.severity,
        yearFrom: issue.yearFrom,
        yearTo: issue.yearTo,
        source: issue.source,
        contentHash,
      };

      if (existingHashes.has(contentHash)) {
        await this.prisma.knownIssue.update({
          where: { vehicleModelId_contentHash: { vehicleModelId: vehicleModel.id, contentHash } },
          data: {
            issueDescription: data.issueDescription,
            category: data.category,
            severity: data.severity,
            yearFrom: data.yearFrom,
            yearTo: data.yearTo,
            source: data.source,
          },
        });
        updated += 1;
      } else {
        await this.prisma.knownIssue.create({ data });
        created += 1;
      }
    }

    return { created, updated };
  }
}
