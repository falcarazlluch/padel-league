import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

const ARGON2_OPTS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const;

async function main() {
  const email = process.env.SEED_SUPERADMIN_EMAIL;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.log('[seed] SEED_SUPERADMIN_EMAIL/PASSWORD not set — skipping');
    return;
  }
  if (password.length < 10) {
    throw new Error('SEED_SUPERADMIN_PASSWORD must be ≥ 10 chars');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Super admin ${email} already exists`);
    return;
  }

  const passwordHash = await hash(password, ARGON2_OPTS);

  await prisma.user.create({
    data: {
      email,
      name: 'Super Admin',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`[seed] Created super admin ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
