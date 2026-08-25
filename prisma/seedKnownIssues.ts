import pino from 'pino';

import { createPrismaClient, type DatabaseClient } from '../shared/src/db/client.js';

export interface KnownIssueSeedRecord {
  id: string;
  brand: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  issueDescription: string;
  severity: 'low' | 'medium' | 'high';
  source: string;
}

export const KNOWN_ISSUE_SEED: readonly KnownIssueSeedRecord[] = [
  {
    id: 'seed-toyota-corolla-r-2024-463',
    brand: 'Toyota',
    model: 'Corolla',
    yearFrom: 2023,
    yearTo: 2023,
    issueDescription: 'Recall R/2024/463: skid-control ECU software can produce a hard brake-pedal feel; affected vehicles require brake-actuator ECU reprogramming.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/TOYOTA%20%28GB%29%20PLC/model/COROLLA/year/2023/recalls',
  },
  {
    id: 'seed-toyota-corolla-r-2023-279',
    brand: 'Toyota',
    model: 'Corolla',
    yearFrom: 2023,
    yearTo: 2023,
    issueDescription: 'Recall R/2023/279: the data communication module may fail to restart, making the emergency-call function unavailable until its software is updated.',
    severity: 'medium',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/TOYOTA%20%28GB%29%20PLC/model/COROLLA/year/2023/recalls',
  },
  {
    id: 'seed-volkswagen-golf-r-2017-040',
    brand: 'Volkswagen',
    model: 'Golf',
    yearFrom: 2016,
    yearTo: 2016,
    issueDescription: 'Recall R/2017/040: control-unit programming may fail to warn the driver about failed exterior lights; affected vehicles require reprogramming.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/VW/model/GOLF/year/2016/recalls',
  },
  {
    id: 'seed-volkswagen-golf-r-2016-174',
    brand: 'Volkswagen',
    model: 'Golf',
    yearFrom: 2016,
    yearTo: 2016,
    issueDescription: 'Recall R/2016/174: an out-of-specification cylinder head may allow the fuel rail to loosen and leak, creating a possible engine-compartment fire risk.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/VW/model/GOLF/year/2016/recalls',
  },
  {
    id: 'seed-renault-clio-r-2015-136',
    brand: 'Renault',
    model: 'Clio',
    yearFrom: 2013,
    yearTo: 2013,
    issueDescription: 'Recall R/2015/136: incorrectly positioned wheel-arch liners may rub front brake hoses and reduce braking performance.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/RENAULT/model/CLIO/year/2013/recalls',
  },
  {
    id: 'seed-renault-clio-r-2016-192',
    brand: 'Renault',
    model: 'Clio',
    yearFrom: 2013,
    yearTo: 2013,
    issueDescription: 'Recall R/2016/192: in freezing conditions the windscreen-wiper linkage may weaken, detach, or bend and stop clearing the screen effectively.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/RENAULT/model/CLIO/year/2013/recalls',
  },
  {
    id: 'seed-seat-leon-r-2021-324',
    brand: 'SEAT',
    model: 'Leon',
    yearFrom: 2020,
    yearTo: 2020,
    issueDescription: 'Recall R/2021/324: a manufacturing error may leave the front seat belts improperly anchored; affected belts require inspection and possible replacement.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/SEAT/model/LEON/year/2020/recalls',
  },
  {
    id: 'seed-seat-leon-r-2022-185',
    brand: 'SEAT',
    model: 'Leon',
    yearFrom: 2020,
    yearTo: 2020,
    issueDescription: 'Recall R/2022/185: the clutch pedal may catch and damage the airbag-control-unit wiring harness if it was positioned incorrectly during assembly.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/SEAT/model/LEON/year/2020/recalls',
  },
  {
    id: 'seed-peugeot-2008-r-2017-140',
    brand: 'Peugeot',
    model: '2008',
    yearFrom: 2016,
    yearTo: 2016,
    issueDescription: 'Recall R/2017/140: a nonconforming starter relay may overheat the starter motor and, in extreme cases, create a fire risk.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/PEUGEOT/model/2008/year/2016/recalls',
  },
  {
    id: 'seed-peugeot-2008-r-2025-246',
    brand: 'Peugeot',
    model: '2008',
    yearFrom: 2019,
    yearTo: 2019,
    issueDescription: 'Recall R/2025/246: premature camshaft-chain wear on affected DV5R engines may cause abnormal noise or eventual chain breakage.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/PEUGEOT/model/2008/year/2019/recalls',
  },
  {
    id: 'seed-bmw-3-series-r-2018-258',
    brand: 'BMW',
    model: 'Serie 3',
    yearFrom: 2016,
    yearTo: 2016,
    issueDescription: 'Recall R/2018/258: the exhaust-gas-recirculation cooler may leak and create a fire risk; affected vehicles require an improved cooler.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/BMW/model/3%20SERIES/year/2016/recalls',
  },
  {
    id: 'seed-bmw-3-series-r-2016-224',
    brand: 'BMW',
    model: 'Serie 3',
    yearFrom: 2016,
    yearTo: 2016,
    issueDescription: 'Recall R/2016/224: reused rear-axle-support bolts may loosen after repair work and affect vehicle handling.',
    severity: 'high',
    source: 'https://www.check-vehicle-recalls.service.gov.uk/recall-type/vehicle/make/BMW/model/3%20SERIES/year/2016/recalls',
  },
];

export interface SeedKnownIssuesSummary {
  total: number;
  created: number;
  updated: number;
}

export async function seedKnownIssues(prisma: DatabaseClient): Promise<SeedKnownIssuesSummary> {
  const ids = KNOWN_ISSUE_SEED.map(({ id }) => id);
  const existing = await prisma.knownIssue.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map(({ id }) => id));

  await prisma.$transaction(
    KNOWN_ISSUE_SEED.map((record) => prisma.knownIssue.upsert({
      where: { id: record.id },
      create: record,
      update: {
        brand: record.brand,
        model: record.model,
        yearFrom: record.yearFrom,
        yearTo: record.yearTo,
        issueDescription: record.issueDescription,
        severity: record.severity,
        source: record.source,
      },
    })),
  );

  const updated = existingIds.size;
  return { total: ids.length, created: ids.length - updated, updated };
}

async function main(): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = createPrismaClient();
  try {
    logger.info(await seedKnownIssues(prisma), 'KnownIssue seed completed');
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    process.stderr.write(`KnownIssue seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
