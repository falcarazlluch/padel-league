import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';

const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  const log = logger();
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE)?.value;
        if (!token) throw new Error('Unauthorized');
        const user = await getValidatedSession(token).catch(() => null);
        if (!user) throw new Error('Unauthorized');

        // pathname looks like "avatars/<userId>-<random>.<ext>"
        const userIdInPath = pathname.split('/').pop()?.split('-')[0];
        if (userIdInPath !== user.id) {
          throw new Error('You can only upload your own avatar.');
        }

        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const payload = tokenPayload ? (JSON.parse(tokenPayload) as { userId: string }) : null;
          if (!payload) return;
          await prisma.user.update({
            where: { id: payload.userId },
            data: { avatarUrl: blob.url },
          });
        } catch (err) {
          log.error({ err }, 'avatar.persist-failed');
          throw err;
        }
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
