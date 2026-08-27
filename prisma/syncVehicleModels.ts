#!/usr/bin/env node

import { createPrismaClient } from '../shared/src/db/client.js';
import {
  loadCanonicalVehicleModels,
  resolveVehicleModelIdentity,
  vehicleModelIdentityUpdate,
  type VehicleTaxonomyIdentity,
} from '../shared/src/vehicleTaxonomy.js';

export async function syncVehicleModels(prisma = createPrismaClient()) {
  const ownsClient = arguments.length === 0;
  try {
    await prisma.vehicleModel.updateMany({
      where: { source: 'wallapop', taxonomyStatus: 'canonical' },
      data: { active: false },
    });
    for (const identity of loadCanonicalVehicleModels()) {
      await upsertIdentity(prisma, identity);
    }

    const listingPairs = await prisma.listing.findMany({
      distinct: ['brand', 'model'],
      select: { brand: true, model: true },
    });
    for (const pair of listingPairs) {
      const vehicleModel = await upsertIdentity(prisma, resolveVehicleModelIdentity(pair.brand, pair.model));
      await prisma.listing.updateMany({
        where: { brand: pair.brand, model: pair.model },
        data: { vehicleModelId: vehicleModel.id },
      });
    }

    const researched = await prisma.knownModelIssues.findMany({ select: { id: true, vehicleModelId: true, year: true } });
    for (const issue of researched) {
      await prisma.listing.updateMany({
        where: { vehicleModelId: issue.vehicleModelId, year: issue.year },
        data: { knownModelIssuesId: issue.id },
      });
    }
    return { canonical: loadCanonicalVehicleModels().length, listingPairs: listingPairs.length };
  } finally {
    if (ownsClient) await prisma.$disconnect();
  }
}

async function upsertIdentity(prisma: ReturnType<typeof createPrismaClient>, identity: VehicleTaxonomyIdentity) {
  return prisma.vehicleModel.upsert({
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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void syncVehicleModels().then((summary) => {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
