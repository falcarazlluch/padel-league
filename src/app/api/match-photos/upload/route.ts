import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import {
  MatchPhotoService,
  MAX_PHOTO_BYTES,
  ALLOWED_PHOTO_CONTENT_TYPES,
  type MatchKind,
} from '@/modules/match-photos';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { logger } from '@/shared/logger';

interface PathnameParts {
  kind: MatchKind;
  matchId: string;
}

/**
 * Pathname looks like "match-photos/<kind>/<matchId>/<random>.<ext>".
 * The kind segment is restricted to "league" or "independent" so the ACL
 * branch is unambiguous.
 */
function parsePathname(pathname: string): PathnameParts | null {
  const parts = pathname.split('/');
  if (parts.length < 4) return null;
  const [bucket, kindRaw, matchId] = parts;
  if (bucket !== 'match-photos') return null;
  if (kindRaw !== 'league' && kindRaw !== 'independent') return null;
  if (!matchId) return null;
  return { kind: kindRaw, matchId };
}

export async function POST(request: Request): Promise<Response> {
  const log = logger();
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    // Don't leak parser internals — return a generic 400 if the JSON wrapper
    // is malformed before any session/ACL work.
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

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

        // Cap token-request rate. Each token issuance fires DB queries via
        // assertParticipantForUpload; without a limit an attacker could loop
        // them indefinitely without ever finalising an upload (so the
        // persist-action limit doesn't apply).
        await checkRateLimit(buildRateLimitKey('match-photo-upload-token', 'user', user.id), {
          limit: 30,
        });

        const parsed = parsePathname(pathname);
        if (!parsed) throw new Error('Pathname must be match-photos/<kind>/<matchId>/<file>.');

        // Same ACL as the service: only match participants can upload.
        await MatchPhotoService.assertParticipantForUpload(parsed.matchId, parsed.kind, user.id);

        return {
          allowedContentTypes: [...ALLOWED_PHOTO_CONTENT_TYPES],
          maximumSizeInBytes: MAX_PHOTO_BYTES,
          tokenPayload: JSON.stringify({
            userId: user.id,
            kind: parsed.kind,
            matchId: parsed.matchId,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // The webhook fires after the file lands in Blob. We do NOT persist
        // the row here — the client calls a server action with the URL once
        // the upload resolves, which is more reliable than this webhook
        // (Vercel can drop it on cold-start). This handler is a no-op except
        // for trace logging.
        try {
          const payload = tokenPayload
            ? (JSON.parse(tokenPayload) as { userId: string; kind: MatchKind; matchId: string })
            : null;
          log.info(
            { url: blob.url, kind: payload?.kind, matchId: payload?.matchId },
            'match-photo.upload-completed',
          );
        } catch (err) {
          log.warn({ err }, 'match-photo.token-payload-parse-failed');
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
