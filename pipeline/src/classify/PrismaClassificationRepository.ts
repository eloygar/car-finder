import { Prisma } from '../../../prisma/generated/client/client.js';
import type { ListingClassification } from '../../../shared/src/classification/ListingClassification.js';
import type { DatabaseClient } from '../db/client.js';
import type {
  ClassificationCandidate,
  ClassificationRepository,
  ClassificationRunOptions,
  IssueAssessmentCandidate,
  ListingIssueAssessmentCandidate,
} from './types.js';
import { issueKey } from '../../../shared/src/modelIssueAssessment.js';
import {
  resolveVehicleModelIdentity,
  vehicleModelIdentityUpdate,
} from '../../../shared/src/vehicleTaxonomy.js';

export class PrismaClassificationRepository implements ClassificationRepository {
  constructor(
    private readonly prisma: DatabaseClient,
    private readonly features: { listingIssueAssessments: boolean } = { listingIssueAssessments: false },
  ) {}

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
            ...(this.features.listingIssueAssessments
              ? [{ listingIssueExtraction: { is: { issues: { some: { assessment: null } } } } }]
              : []),
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
    listingExtraction?: Parameters<ClassificationRepository['saveClassification']>[0]['listingExtraction'];
    clearListingExtraction?: boolean;
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
        if (options.clearListingExtraction || options.listingExtraction) {
          await transaction.listingIssueExtraction.deleteMany({
            where: { listingId: options.candidate.id },
          });
        }
        if (options.listingExtraction) {
          await transaction.listingIssueExtraction.create({
            data: {
              listingId: options.candidate.id,
              inputHash: options.listingExtraction.inputHash,
              anthropicModel: options.listingExtraction.anthropicModel,
              analysisVersion: options.listingExtraction.analysisVersion,
              extractedAt: options.classifiedAt,
              issues: {
                create: categorizedDetectedIssues(options.listingExtraction.issues).map((issue) => ({
                  issueKey: issueKey(issue.description),
                  category: issue.category,
                  description: issue.description,
                  evidence: issue.evidence,
                })),
              },
            },
          });
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

  async findListingIssueExtraction(
    candidate: ClassificationCandidate,
    inputHash: string,
    analysisVersion: string,
  ): Promise<{ issueCount: number } | null> {
    const extraction = await this.prisma.listingIssueExtraction.findFirst({
      where: { listingId: candidate.id, inputHash, analysisVersion },
      select: { _count: { select: { issues: true } } },
    });
    return extraction ? { issueCount: extraction._count.issues } : null;
  }

  async findListingIssueAssessmentCandidates(
    candidate: ClassificationCandidate,
  ): Promise<ListingIssueAssessmentCandidate[]> {
    const extraction = await this.prisma.listingIssueExtraction.findUnique({
      where: { listingId: candidate.id },
      select: {
        issues: {
          orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            issueKey: true,
            category: true,
            description: true,
            evidence: true,
            assessment: { select: { id: true } },
          },
        },
      },
    });
    const categoryOrder = { mechanical: 0, bodywork: 1, interior: 2, other: 3 } as Record<string, number>;
    return extraction?.issues.sort((left, right) =>
      (categoryOrder[left.category] ?? 4) - (categoryOrder[right.category] ?? 4),
    ).map((issue) => ({
      detectedIssueId: issue.id,
      brand: candidate.brand,
      model: candidate.model,
      ...(candidate.year === null ? {} : { year: candidate.year }),
      issue: issue.description,
      issueKey: issue.issueKey,
      evidence: issue.evidence,
      cached: issue.assessment !== null,
    })) ?? [];
  }

  async findKnownModelIssues(candidate: ClassificationCandidate, analysisVersion: string): Promise<boolean> {
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
      where: { vehicleModelId: vehicleModel.id, year: candidate.year, analysisVersion },
    })) > 0;
  }

  async findIssueAssessmentCandidates(candidate: ClassificationCandidate): Promise<IssueAssessmentCandidate[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: candidate.id },
      select: {
        vehicleModel: {
          select: {
            id: true,
            brand: true,
            model: true,
            issueAssessments: { select: { issueKey: true } },
          },
        },
        knownModelIssues: {
          select: { mechanical: true, bodywork: true, interior: true, other: true },
        },
      },
    });
    if (!listing?.vehicleModel || !listing.knownModelIssues) return [];
    const cached = new Set(listing.vehicleModel.issueAssessments.map((entry) => entry.issueKey));
    const issues = [
      ...listing.knownModelIssues.mechanical,
      ...listing.knownModelIssues.bodywork,
      ...listing.knownModelIssues.interior,
      ...listing.knownModelIssues.other,
    ];
    return issues.map((issue) => {
      const key = issueKey(issue);
      return {
        vehicleModelId: listing.vehicleModel!.id,
        brand: listing.vehicleModel!.brand,
        model: listing.vehicleModel!.model,
        issue,
        issueKey: key,
        cached: cached.has(key),
      };
    });
  }

  async saveIssueAssessment(
    options: Parameters<ClassificationRepository['saveIssueAssessment']>[0],
  ): Promise<void> {
    const data = {
      issueText: options.candidate.issue,
      severity: options.assessment.severity,
      estimatedCostMinEUR: options.assessment.estimatedCostMinEUR,
      estimatedCostMaxEUR: options.assessment.estimatedCostMaxEUR,
      reasoning: options.assessment.reasoning,
      sources: options.assessment.sources as unknown as Prisma.InputJsonValue,
      pricingYear: options.pricingYear,
      anthropicModel: options.anthropicModel,
      analysisVersion: options.analysisVersion,
      assessedAt: options.assessedAt,
    };
    await this.prisma.modelIssueAssessment.upsert({
      where: {
        vehicleModelId_issueKey: {
          vehicleModelId: options.candidate.vehicleModelId,
          issueKey: options.candidate.issueKey,
        },
      },
      create: {
        vehicleModelId: options.candidate.vehicleModelId,
        issueKey: options.candidate.issueKey,
        ...data,
      },
      update: data,
    });
  }

  async saveListingIssueAssessment(
    options: Parameters<ClassificationRepository['saveListingIssueAssessment']>[0],
  ): Promise<void> {
    const data = {
      severity: options.assessment.severity,
      estimatedCostMinEUR: options.assessment.estimatedCostMinEUR,
      estimatedCostMaxEUR: options.assessment.estimatedCostMaxEUR,
      reasoning: options.assessment.reasoning,
      sources: options.assessment.sources as unknown as Prisma.InputJsonValue,
      pricingYear: options.pricingYear,
      anthropicModel: options.anthropicModel,
      analysisVersion: options.analysisVersion,
      assessedAt: options.assessedAt,
    };
    await this.prisma.listingIssueAssessment.upsert({
      where: { detectedIssueId: options.candidate.detectedIssueId },
      create: { detectedIssueId: options.candidate.detectedIssueId, ...data },
      update: data,
    });
  }
}

class StaleListingError extends Error {}

function issueCount(analysis: NonNullable<Parameters<ClassificationRepository['saveClassification']>[0]['researchedIssues']>['analysis']) {
  return analysis.mechanical.length + analysis.bodywork.length + analysis.interior.length + analysis.other.length;
}

function categorizedDetectedIssues(
  issues: NonNullable<Parameters<ClassificationRepository['saveClassification']>[0]['listingExtraction']>['issues'],
) {
  return (['mechanical', 'bodywork', 'interior', 'other'] as const).flatMap((category) =>
    issues[category].map((issue) => ({ category, ...issue })),
  );
}
