import { describe, expect, it, vi } from 'vitest';

import { PrismaKnownIssuesStore } from '../src/db/PrismaKnownIssuesStore.js';
import type { DatabaseClient } from '../../shared/src/db/client.js';
import type { ResearchedIssue, VehicleQuery } from '../src/tools/types.js';

function mockPrisma(overrides: Partial<{
  vehicleModelUpsert: ReturnType<typeof vi.fn>;
  knownIssueFindMany: ReturnType<typeof vi.fn>;
  knownIssueUpdate: ReturnType<typeof vi.fn>;
  knownIssueCreate: ReturnType<typeof vi.fn>;
}> = {}) {
  const vehicleModelUpsert = overrides.vehicleModelUpsert ?? vi.fn().mockResolvedValue({ id: 'vm-1' });
  const knownIssueFindMany = overrides.knownIssueFindMany ?? vi.fn().mockResolvedValue([]);
  const knownIssueUpdate = overrides.knownIssueUpdate ?? vi.fn().mockResolvedValue(undefined);
  const knownIssueCreate = overrides.knownIssueCreate ?? vi.fn().mockResolvedValue(undefined);
  const prisma = {
    vehicleModel: { upsert: vehicleModelUpsert },
    knownIssue: {
      findMany: knownIssueFindMany,
      update: knownIssueUpdate,
      create: knownIssueCreate,
    },
  } as unknown as DatabaseClient;
  return { prisma, vehicleModelUpsert, knownIssueFindMany, knownIssueUpdate, knownIssueCreate };
}

const query: VehicleQuery = { brand: 'Toyota', model: 'Corolla', year: 2023 };

const issue = (description: string): ResearchedIssue => ({
  description,
  category: 'mecanica',
  severity: 'high',
  yearFrom: 2023,
  yearTo: 2023,
  source: 'https://example.test/x',
});

describe('PrismaKnownIssuesStore', () => {
  it('upserts the vehicle model and creates new issues', async () => {
    const { prisma, vehicleModelUpsert, knownIssueCreate, knownIssueUpdate } = mockPrisma();
    const writer = new PrismaKnownIssuesStore(prisma);

    const result = await writer.saveResearchedIssues(query, [issue('Fallo de ECU')]);

    expect(vehicleModelUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { brand_name: { brand: 'Toyota', name: 'Corolla' } },
    }));
    expect(knownIssueCreate).toHaveBeenCalledTimes(1);
    expect(knownIssueUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 1, updated: 0 });
  });

  it('updates instead of creating when the content hash already exists', async () => {
    const knownIssueFindMany = vi.fn().mockImplementation((args: { where: { contentHash: { in: string[] } } }) =>
      Promise.resolve(args.where.contentHash.in.map((contentHash) => ({ contentHash }))),
    );
    const { prisma, knownIssueCreate, knownIssueUpdate } = mockPrisma({ knownIssueFindMany });
    const writer = new PrismaKnownIssuesStore(prisma);

    const result = await writer.saveResearchedIssues(query, [issue('Fallo de ECU')]);

    expect(knownIssueFindMany).toHaveBeenCalled();
    expect(knownIssueUpdate).toHaveBeenCalledTimes(1);
    expect(knownIssueCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 1 });
  });

  it('assigns the issue to the related vehicle model', async () => {
    const { prisma, knownIssueCreate } = mockPrisma();
    const writer = new PrismaKnownIssuesStore(prisma);

    await writer.saveResearchedIssues(query, [issue('Fallo de ECU')]);

    const data = knownIssueCreate.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      vehicleModelId: 'vm-1',
      brand: 'Toyota',
      model: 'Corolla',
      category: 'mecanica',
      issueDescription: 'Fallo de ECU',
    });
    expect(typeof data.contentHash).toBe('string');
  });
});
