import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { OrganizationService } from '@/modules/organizations';
import { logger } from '@/shared/logger';

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

/**
 * Org logo upload, mirroring the team-logo flow. The authorisation check that
 * matters is `assertOrgAdmin`: without it any member of any organization could
 * repaint another club's brand by crafting the pathname.
 */
export async function POST(request: Request): Promise<Response> {
  const log = logger();
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Session check happens here — only on the initial client-driven
        // request. The follow-up "upload-completed" webhook from Vercel Blob
        // carries no session cookie; handleUpload verifies its signed token.
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE)?.value;
        if (!token) throw new Error('Unauthorized');
        const user = await getValidatedSession(token).catch(() => null);
        if (!user) throw new Error('Unauthorized');

        // pathname looks like "org-logos/<organizationId>-<random>.<ext>"
        const organizationId = pathname.split('/').pop()?.split('-')[0];
        if (!organizationId) {
          throw new Error('Pathname must include the organization id.');
        }
        await OrganizationService.assertOrgAdmin(organizationId, user.id);

        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ organizationId, userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // No session here — tokenPayload was signed by handleUpload at
        // generation time, so its contents are trusted. The admin check is
        // repeated anyway: cheap, and the payload is the only thing standing
        // between a replayed webhook and someone else's branding.
        try {
          const payload = tokenPayload
            ? (JSON.parse(tokenPayload) as { organizationId: string; userId: string })
            : null;
          if (!payload) return;
          if (!(await OrganizationService.canAdminister(payload.organizationId, payload.userId))) {
            return;
          }
          await prisma.organization.update({
            where: { id: payload.organizationId },
            data: { logoUrl: blob.url },
          });
        } catch (err) {
          log.error({ err }, 'org-logo.upload-completed.failed');
        }
      },
    });

    return NextResponse.json(json);
  } catch (err) {
    log.warn({ err }, 'org-logo.upload.rejected');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 400 },
    );
  }
}
