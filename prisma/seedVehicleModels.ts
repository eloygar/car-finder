import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pino from 'pino';

import { createPrismaClient } from '../shared/src/db/client.js';

function slugify(brand: string, model: string): string {
  return `${brand}-${model}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface SeedVehicleModelsSummary {
  total: number;
  created: number;
  existing: number;
}

export async function seedVehicleModels(
  prisma: ReturnType<typeof createPrismaClient>,
  taxonomyPath: string,
): Promise<SeedVehicleModelsSummary> {
  const taxonomy = JSON.parse(readFileSync(taxonomyPath, 'utf8')) as {
    brands: string[];
    models: Record<string, string[]>;
  };

  const rows = [...Object.entries(taxonomy.models)].flatMap(([brand, models]) =>
    models.map((name) => {
      const slug = slugify(brand, name);
      return { brand, name, slug };
    }),
  );

  const existingSlugs = new Set(
    (
      await prisma.vehicleModel.findMany({
        where: { slug: { in: rows.map((row) => row.slug) } },
        select: { slug: true },
      })
    ).map((row) => row.slug),
  );

  const toCreate = rows.filter((row) => !existingSlugs.has(row.slug));
  if (toCreate.length > 0) {
    await prisma.vehicleModel.createMany({ data: toCreate, skipDuplicates: true });
  }

  return { total: rows.length, created: toCreate.length, existing: existingSlugs.size };
}

async function main(): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = createPrismaClient();
  const taxonomyPath =
    process.argv[2] ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/wallapop-car-taxonomy-capture.json');
  try {
    const summary = await seedVehicleModels(prisma, taxonomyPath);
    logger.info(summary, 'VehicleModel catalog seed completed');
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    process.stderr.write(`VehicleModel seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
