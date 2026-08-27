import { describe, expect, it, vi } from 'vitest';
import { issueKey } from '../../shared/src/modelIssueAssessment.js';
import { PrismaIssueAssessmentRepository } from '../src/assessIssues/PrismaIssueAssessmentRepository.js';
import type { DatabaseClient } from '../src/db/client.js';

function fakeClient() {
  const findMany = vi.fn().mockResolvedValue([
    {
      mechanical: ['Fallo de bomba.'], bodywork: [], interior: [], other: [],
      vehicleModel: {
        id: 'model-1', brand: 'Toyota', model: 'Corolla',
        issueAssessments: [{ issueKey: issueKey('Incidencia antigua.'), assessedAt: new Date('2025-01-01') }],
      },
    },
    {
      mechanical: [' FALLO  de BOMBA. '], bodywork: [], interior: ['Incidencia antigua.'], other: [],
      vehicleModel: {
        id: 'model-1', brand: 'Toyota', model: 'Corolla',
        issueAssessments: [{ issueKey: issueKey('Incidencia antigua.'), assessedAt: new Date('2025-01-01') }],
      },
    },
  ]);
  const upsert = vi.fn().mockResolvedValue({});
  return {
    prisma: { knownModelIssues: { findMany }, modelIssueAssessment: { upsert } } as unknown as DatabaseClient,
    upsert,
  };
}

describe('PrismaIssueAssessmentRepository', () => {
  it('deduplicates exact normalized issues across model years and skips permanent cache', async () => {
    const { prisma } = fakeClient();
    const repository = new PrismaIssueAssessmentRepository(prisma);
    const pending = await repository.findCandidates({ all: true, dryRun: false, force: false });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ issueKey: issueKey('Fallo de bomba.'), cached: false });
  });

  it('includes cached assessments during forced refresh, oldest first', async () => {
    const { prisma } = fakeClient();
    const repository = new PrismaIssueAssessmentRepository(prisma);
    const candidates = await repository.findCandidates({ all: true, dryRun: false, force: true });
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ issue: 'Fallo de bomba.', cached: false });
    expect(candidates[1]).toMatchObject({ issue: 'Incidencia antigua.', cached: true });
  });

  it('upserts by vehicle model and issue key', async () => {
    const { prisma, upsert } = fakeClient();
    const repository = new PrismaIssueAssessmentRepository(prisma);
    await repository.save({
      candidate: {
        vehicleModelId: 'model-1', brand: 'Toyota', model: 'Corolla',
        issue: 'Fallo de bomba.', issueKey: issueKey('Fallo de bomba.'), cached: false,
      },
      result: {
        assessment: {
          severity: 'high', estimatedCostMinEUR: 800, estimatedCostMaxEUR: 1_500,
          reasoning: 'Reparación costosa.', sources: [{ title: 'Taller', url: 'https://example.test' }],
        },
        pricingYear: 2026, anthropicModel: 'claude-haiku', inputTokens: 1, outputTokens: 1,
      },
      analysisVersion: 'v1', assessedAt: new Date('2026-08-27'),
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { vehicleModelId_issueKey: {
        vehicleModelId: 'model-1', issueKey: issueKey('Fallo de bomba.'),
      } },
      create: expect.objectContaining({ severity: 'high', pricingYear: 2026 }),
    }));
  });
});
