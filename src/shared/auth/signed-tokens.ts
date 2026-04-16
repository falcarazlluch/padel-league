import { Prisma, SignedTokenPurpose } from '@prisma/client';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/shared/db/client';
import { InvalidTokenError } from '@/shared/errors';

export { SignedTokenPurpose };

export interface IssueOptions {
  purpose: SignedTokenPurpose;
  subjectId: string;
  ttlSeconds: number;
  metadata?: Record<string, unknown>;
}

export interface ConsumeResult {
  subjectId: string;
  metadata: Record<string, unknown> | null;
}

function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required');
  return new TextEncoder().encode(secret);
}

export const SignedTokenService = {
  async issue(opts: IssueOptions): Promise<string> {
    const jti = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + opts.ttlSeconds * 1000);

    await prisma.signedToken.create({
      data: {
        jti,
        purpose: opts.purpose,
        subjectId: opts.subjectId,
        metadata: (opts.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
        expiresAt,
      },
    });

    const token = await new SignJWT({ purpose: opts.purpose, sub: opts.subjectId })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(getSecret());

    return token;
  },

  async consume(token: string, expectedPurpose: SignedTokenPurpose): Promise<ConsumeResult> {
    let jti: string;
    try {
      const { payload } = await jwtVerify(token, getSecret());
      if (!payload.jti) throw new Error('missing jti');
      jti = payload.jti;
    } catch {
      throw new InvalidTokenError('TOKEN_INVALID', 'El enlace no es válido o ha caducado.');
    }

    // CAS: atomic update — only succeeds if not yet used and not expired
    const result = await prisma.$queryRaw<{ subject_id: string; metadata: unknown }[]>`
      UPDATE signed_tokens
      SET used_at = now()
      WHERE jti = ${jti}
        AND purpose = ${expectedPurpose}::"SignedTokenPurpose"
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING subject_id, metadata
    `;

    if (result.length === 0) {
      throw new InvalidTokenError('TOKEN_INVALID', 'El enlace no es válido o ha caducado.');
    }

    const row = result[0]!;
    return {
      subjectId: row.subject_id,
      metadata: row.metadata as Record<string, unknown> | null,
    };
  },
} as const;
