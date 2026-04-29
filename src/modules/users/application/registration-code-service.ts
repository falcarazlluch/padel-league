import { prisma } from '@/shared/db/client';
import { AuthorizationError, DomainError, NotFoundError } from '@/shared/errors';
import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid confusion

function makeCode(): string {
  const bytes = randomBytes(8);
  const chars: string[] = [];
  for (let i = 0; i < 8; i++) {
    chars.push(ALPHABET[bytes[i]! % ALPHABET.length]!);
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

const MAX_PER_BATCH = 25;

export type RegistrationCodeRow = {
  id: string;
  code: string;
  createdAt: Date;
  expiresAt: Date | null;
  usedAt: Date | null;
  createdByName: string | null;
  usedByName: string | null;
};

async function ensureSuperAdmin(actorId: string): Promise<void> {
  const acting = await prisma.user.findUnique({
    where: { id: actorId },
    select: { role: true },
  });
  if (acting?.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('FORBIDDEN', 'Acción reservada para Super Admin.');
  }
}

export const RegistrationCodeService = {
  async generate(
    actorId: string,
    opts: { count?: number; expiresInDays?: number } = {},
  ): Promise<string[]> {
    await ensureSuperAdmin(actorId);
    const count = Math.min(Math.max(opts.count ?? 1, 1), MAX_PER_BATCH);
    const expiresAt = opts.expiresInDays
      ? new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const codes: string[] = [];
    // Try to insert with retries for the rare collision.
    for (let i = 0; i < count; i++) {
      let inserted = false;
      for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
        const code = makeCode();
        try {
          await prisma.registrationCode.create({
            data: { code, createdByUserId: actorId, expiresAt },
          });
          codes.push(code);
          inserted = true;
        } catch (err) {
          // Likely unique violation: regenerate and retry.
          const e = err as { code?: string };
          if (e.code !== 'P2002') throw err;
        }
      }
      if (!inserted) throw new DomainError('GENERATION_FAILED', 'No se pudo generar un código único.');
    }
    return codes;
  },

  async list(actorId: string): Promise<RegistrationCodeRow[]> {
    await ensureSuperAdmin(actorId);
    const rows = await prisma.registrationCode.findMany({
      include: {
        createdBy: { select: { name: true } },
        usedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      usedAt: r.usedAt,
      createdByName: r.createdBy?.name ?? null,
      usedByName: r.usedBy?.name ?? null,
    }));
  },

  async revoke(actorId: string, codeId: string): Promise<void> {
    await ensureSuperAdmin(actorId);
    const row = await prisma.registrationCode.findUnique({ where: { id: codeId } });
    if (!row) throw new NotFoundError('CODE_NOT_FOUND', 'Código no encontrado.');
    if (row.usedAt !== null) {
      throw new DomainError('CODE_ALREADY_USED', 'El código ya fue usado y no puede borrarse.');
    }
    await prisma.registrationCode.delete({ where: { id: codeId } });
  },

  /**
   * Returns the row if the code is valid and unused. Doesn't mark as used yet —
   * call `consume` inside the same transaction as the user creation.
   */
  async findValid(rawCode: string): Promise<{ id: string } | null> {
    const code = rawCode.trim().toUpperCase();
    if (code.length === 0) return null;
    const row = await prisma.registrationCode.findUnique({ where: { code } });
    if (!row) return null;
    if (row.usedAt !== null) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
    return { id: row.id };
  },
} as const;
