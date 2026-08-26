import { createPrismaClient } from './db/client.js';
import { normalizeBrand } from './brandNormalization.js';

async function main() {
  const prisma = createPrismaClient();
  try {
    const rows = await prisma.listing.findMany({
      select: { id: true, brand: true },
      where: { status: { not: 'deleted' } },
    });

    let normalized = 0;
    let skipped = 0;
    for (const row of rows) {
      const normalizedBrand = normalizeBrand(row.brand);
      if (normalizedBrand && normalizedBrand !== row.brand) {
        await prisma.listing.update({
          where: { id: row.id },
          data: { brand: normalizedBrand },
        });
        normalized += 1;
      } else {
        skipped += 1;
      }
    }

    console.log(`Brand normalization complete: ${normalized} updated, ${skipped} unchanged.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
