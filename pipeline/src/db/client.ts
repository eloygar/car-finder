import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../../prisma/generated/client/client.js';

export const LOCAL_DATABASE_URL =
  'postgresql://car_finder:car_finder@localhost:5432/car_finder?schema=public';

export function createPrismaClient(
  databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export type DatabaseClient = PrismaClient;
