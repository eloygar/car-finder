import { Prisma } from '../../../prisma/generated/client/client.js';
import { issueKey } from '../../../shared/src/modelIssueAssessment.js';
import type { DatabaseClient } from '../db/client.js';
import type { IssueAssessmentCandidate } from '../classify/types.js';
import type { AssessIssuesRunOptions, IssueAssessmentRepository } from './types.js';

export class PrismaIssueAssessmentRepository implements IssueAssessmentRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findCandidates(options: AssessIssuesRunOptions): Promise<IssueAssessmentCandidate[]> {
    const rows = await this.prisma.knownModelIssues.findMany({
      orderBy: [{ vehicleModelId: 'asc' }, { year: 'asc' }],
      select: {
        mechanical: true, bodywork: true, interior: true, other: true,
        vehicleModel: {
          select: {
            id: true, brand: true, model: true,
            issueAssessments: { select: { issueKey: true, assessedAt: true } },
          },
        },
      },
    });
    const unique = new Map<string, IssueAssessmentCandidate & { assessedAt: Date | null }>();
    for (const row of rows) {
      const assessments = new Map(row.vehicleModel.issueAssessments.map((entry) => [entry.issueKey, entry.assessedAt]));
      for (const issue of [...row.mechanical, ...row.bodywork, ...row.interior, ...row.other]) {
        const key = issueKey(issue);
        const cacheKey = `${row.vehicleModel.id}\u0000${key}`;
        const assessedAt = assessments.get(key) ?? null;
        if (unique.has(cacheKey)) continue;
        unique.set(cacheKey, {
          vehicleModelId: row.vehicleModel.id,
          brand: row.vehicleModel.brand,
          model: row.vehicleModel.model,
          issue,
          issueKey: key,
          cached: assessedAt !== null,
          assessedAt,
        });
      }
    }
    const candidates = [...unique.values()]
      .filter((candidate) => options.force || !candidate.cached)
      .sort((left, right) => {
        if (left.assessedAt === null && right.assessedAt !== null) return -1;
        if (left.assessedAt !== null && right.assessedAt === null) return 1;
        const byDate = (left.assessedAt?.getTime() ?? 0) - (right.assessedAt?.getTime() ?? 0);
        if (byDate !== 0) return byDate;
        return `${left.brand}\u0000${left.model}\u0000${left.issue}`
          .localeCompare(`${right.brand}\u0000${right.model}\u0000${right.issue}`, 'es');
      });
    return (options.all ? candidates : candidates.slice(0, options.limit ?? 20))
      .map(({ assessedAt: _assessedAt, ...candidate }) => candidate);
  }

  async save(options: Parameters<IssueAssessmentRepository['save']>[0]): Promise<void> {
    const data = {
      issueText: options.candidate.issue,
      severity: options.result.assessment.severity,
      estimatedCostMinEUR: options.result.assessment.estimatedCostMinEUR,
      estimatedCostMaxEUR: options.result.assessment.estimatedCostMaxEUR,
      reasoning: options.result.assessment.reasoning,
      sources: options.result.assessment.sources as unknown as Prisma.InputJsonValue,
      pricingYear: options.result.pricingYear,
      anthropicModel: options.result.anthropicModel,
      analysisVersion: options.analysisVersion,
      assessedAt: options.assessedAt,
    };
    await this.prisma.modelIssueAssessment.upsert({
      where: { vehicleModelId_issueKey: {
        vehicleModelId: options.candidate.vehicleModelId,
        issueKey: options.candidate.issueKey,
      } },
      create: {
        vehicleModelId: options.candidate.vehicleModelId,
        issueKey: options.candidate.issueKey,
        ...data,
      },
      update: data,
    });
  }
}
