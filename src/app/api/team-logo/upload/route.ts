import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';

const MAX_BYTES = 200 * 1024; // 200KB

export async function POST(request: Request): Promise<Response> {
  const log = logger();
  const body = (await request.json()) as HandleUploadBody;

  // Validate session at the action boundary; the upload uses a client token issued below.
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // pathname looks like "team-logos/<teamId>-<random>"
        const teamId = pathname.split('/').pop()?.split('-')[0];
        if (!teamId) {
          throw new Error('Pathname must include the team id.');
        }
        // Confirm the user is a member of the team they're uploading for.
        const member = await prisma.teamMember.findFirst({
          where: { teamId, userId: user.id },
          select: { id: true },
        });
        if (!member) throw new Error('You are not a member of this team.');

        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ teamId, userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Persist the URL on the team — only if the uploader is still a member.
        try {
          const payload = tokenPayload ? (JSON.parse(tokenPayload) as { teamId: string; userId: string }) : null;
          if (!payload) return;
          const member = await prisma.teamMember.findFirst({
            where: { teamId: payload.teamId, userId: payload.userId },
            select: { id: true },
          });
          if (!member) return;
          await prisma.team.update({
            where: { id: payload.teamId },
            data: { logoUrl: blob.url },
          });
        } catch (err) {
          log.error({ err }, 'team-logo.persist-failed');
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
