import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const { Pool } = await import('pg');

      const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL or DIRECT_URL environment variable is required');
      }

      const pool = new Pool({ connectionString: databaseUrl });
      return new PrismaPg(pool);
    },
  },
});
