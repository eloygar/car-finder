import { Prisma } from '../../../prisma/generated/client/client.js';
import type { ListingClassification } from '../../../shared/src/classification/ListingClassification.js';
import type { DatabaseClient } from '../db/client.js';
import type {
  ClassificationCandidate,
  ClassificationRepository,
  ClassificationRunOptions,
} from './types.js';
import {
  resolveVehicleModelIdentity,
  vehicleModelIdentityUpdate,
} from '../../../shared/src/vehicleTaxonomy.js';

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
    candidate: ClassificationCandidate;
    classification: ListingClassification;
    version: string;
    classifiedAt: Date;
    researchedIssues?: Parameters<ClassificationRepository['saveClassification']>[0]['researchedIssues'];
  }): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const identity = resolveVehicleModelIdentity(options.candidate.brand, options.candidate.model);
        const vehicleModel = await transaction.vehicleModel.upsert({
          where: {
            source_normalizedBrand_normalizedModel: {
              source: identity.source,
              normalizedBrand: identity.normalizedBrand,
              normalizedModel: identity.normalizedModel,
            },
          },
          create: identity,
          update: vehicleModelIdentityUpdate(identity),
        });
        let knownModelIssuesId: string | null = null;
        if (options.candidate.year !== null) {
          if (options.researchedIssues) {
            const analysis = options.researchedIssues.analysis;
            const data = {
              mechanical: analysis.mechanical,
              bodywork: analysis.bodywork,
              interior: analysis.interior,
              other: analysis.other,
              sources: analysis.sources as unknown as Prisma.InputJsonValue,
              hasIssues: issueCount(analysis) > 0,
              analysisVersion: options.researchedIssues.analysisVersion,
              anthropicModel: options.researchedIssues.anthropicModel,
              researchedAt: options.classifiedAt,
            };
            const researched = await transaction.knownModelIssues.upsert({
              where: { vehicleModelId_year: { vehicleModelId: vehicleModel.id, year: options.candidate.year } },
              create: { vehicleModelId: vehicleModel.id, year: options.candidate.year, ...data },
              update: data,
            });
            knownModelIssuesId = researched.id;
            await transaction.listing.updateMany({
              where: { vehicleModelId: vehicleModel.id, year: options.candidate.year },
              data: { knownModelIssuesId: researched.id },
            });
          } else {
            knownModelIssuesId = (await transaction.knownModelIssues.findUnique({
              where: { vehicleModelId_year: { vehicleModelId: vehicleModel.id, year: options.candidate.year } },
              select: { id: true },
            }))?.id ?? null;
          }
        }
        const result = await transaction.listing.updateMany({
          where: {
            id: options.candidate.id,
            contentHash: options.candidate.contentHash,
            status: 'active',
          },
          data: {
            classification: options.classification as Prisma.InputJsonValue,
            classificationVersion: options.version,
            classifiedAt: options.classifiedAt,
            vehicleModelId: vehicleModel.id,
            knownModelIssuesId,
          },
        });
        if (result.count !== 1) throw new StaleListingError();
      });
      return true;
    } catch (error) {
      if (error instanceof StaleListingError) return false;
      throw error;
    }
  }

  async findKnownModelIssues(candidate: ClassificationCandidate): Promise<boolean> {
    if (candidate.year === null) return false;
    const identity = resolveVehicleModelIdentity(candidate.brand, candidate.model);
    const vehicleModel = await this.prisma.vehicleModel.findUnique({
      where: {
        source_normalizedBrand_normalizedModel: {
          source: identity.source,
          normalizedBrand: identity.normalizedBrand,
          normalizedModel: identity.normalizedModel,
        },
      },
      select: { id: true },
    });
    if (!vehicleModel) return false;
    return (await this.prisma.knownModelIssues.count({
      where: { vehicleModelId: vehicleModel.id, year: candidate.year },
    })) > 0;
  }
}

class StaleListingError extends Error {}

function issueCount(analysis: NonNullable<Parameters<ClassificationRepository['saveClassification']>[0]['researchedIssues']>['analysis']) {
  return analysis.mechanical.length + analysis.bodywork.length + analysis.interior.length + analysis.other.length;
}
