/**
 * Seeds the RACC whitelabel tenant end-to-end so the flow can be walked
 * immediately after a fresh `prisma migrate deploy`:
 *
 *   pnpm seed:whitelabel
 *
 * Creates the organization, an ORG_ADMIN, a tournament with an open
 * registration window, and a live inscription link — then prints the URL to
 * open. Idempotent: re-running reuses whatever already exists.
 *
 * Local dev without wildcard DNS: open the printed URL, or swap the host for
 * `localhost:3000` and append `?org=racc` once.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const ARGON2_OPTS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const;

const ORG_SLUG = 'racc';
const ORG_NAME = 'RACC';
const ADMIN_EMAIL = process.env.SEED_ORG_ADMIN_EMAIL ?? 'admin@racc.local';
const ADMIN_PASSWORD = process.env.SEED_ORG_ADMIN_PASSWORD ?? 'RaccAdmin2026';

function rootDomain(): string {
  const explicit = process.env.ROOT_DOMAIN?.trim();
  if (explicit) return explicit;
  try {
    return new URL(process.env.APP_URL ?? 'http://localhost:3000').hostname.replace(/^www\./, '');
  } catch {
    return 'localhost';
  }
}

function tenantOrigin(slug: string): string {
  let base: URL;
  try {
    base = new URL(process.env.APP_URL ?? 'http://localhost:3000');
  } catch {
    base = new URL('http://localhost:3000');
  }
  const port = base.port ? `:${base.port}` : '';
  return `${base.protocol}//${slug}.${rootDomain()}${port}`;
}

async function main() {
  if (ADMIN_PASSWORD.length < 10) {
    throw new Error('SEED_ORG_ADMIN_PASSWORD must be ≥ 10 chars');
  }

  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: {
      slug: ORG_SLUG,
      name: ORG_NAME,
      tagline: 'Competiciones de pádel para socios',
      primaryColor: '#003A70',
      secondaryColor: '#0092D0',
      accentColor: '#FFC20E',
      contactEmail: 'padel@racc.local',
    },
  });
  console.log(`[seed:wl] organization ${org.slug} (${org.id})`);

  let admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: 'Admin RACC',
        phone: '600000000',
        passwordHash: await hash(ADMIN_PASSWORD, ARGON2_OPTS),
        emailVerifiedAt: new Date(),
        role: 'PLAYER',
      },
    });
    console.log(`[seed:wl] admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } else {
    console.log(`[seed:wl] admin ${ADMIN_EMAIL} already exists (password unchanged)`);
  }

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: admin.id } },
    update: { role: 'ORG_ADMIN' },
    create: { organizationId: org.id, userId: admin.id, role: 'ORG_ADMIN' },
  });

  const now = Date.now();
  const slug = 'torneo-socios-racc';
  const league =
    (await prisma.league.findUnique({ where: { slug } })) ??
    (await prisma.league.create({
      data: {
        slug,
        name: 'Torneo de Socios RACC',
        description: 'Cuadro de eliminación por parejas. Inscripción abierta a socios.',
        organizationId: org.id,
        type: 'TOURNAMENT',
        category: 'INTERMEDIATE',
        bracketSeedingMode: 'AUTO',
        registrationStart: new Date(now - 3 * 86_400_000),
        registrationEnd: new Date(now + 21 * 86_400_000),
        startDate: new Date(now + 28 * 86_400_000),
        endDate: new Date(now + 60 * 86_400_000),
        createdByUserId: admin.id,
      },
    }));
  console.log(`[seed:wl] competition ${league.slug} (${league.id})`);

  const existingLink = await prisma.tournamentInviteLink.findFirst({
    where: { leagueId: league.id, revokedAt: null },
  });
  const link =
    existingLink ??
    (await prisma.tournamentInviteLink.create({
      data: {
        token: randomBytes(24).toString('base64url'),
        leagueId: league.id,
        organizationId: org.id,
        label: 'Socios RACC',
        expiresAt: league.registrationEnd,
        createdByUserId: admin.id,
      },
    }));

  const origin = tenantOrigin(ORG_SLUG);
  console.log('');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  Entorno RACC:      ${origin}/dashboard`);
  console.log(`  Enlace inscripción: ${origin}/inscripcion/${link.token}`);
  console.log(`  Admin:              ${ADMIN_EMAIL}`);
  console.log('─────────────────────────────────────────────────────────────');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
