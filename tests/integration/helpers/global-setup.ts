import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';

let container: StartedPostgreSqlContainer;

export async function setup() {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('padel_test')
    .withUsername('padel')
    .withPassword('padel')
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;

  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'inherit',
  });
}

export async function teardown() {
  await container?.stop();
}
