import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const localDatabaseUrl =
  'postgresql://car_finder:car_finder@localhost:5432/car_finder?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
});
