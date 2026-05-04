import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchPhotoService } from '@/modules/match-photos';
import { isUserFacingError } from '@/shared/errors';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
): Promise<Response> {
  const { photoId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const detail = await MatchPhotoService.getDetail(photoId, user.id);
    return NextResponse.json({
      comments: detail.comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        authorId: c.authorId,
        authorName: c.authorName,
        authorAvatarUrl: c.authorAvatarUrl,
        canDelete: c.canDelete,
      })),
    });
  } catch (err) {
    if (isUserFacingError(err)) {
      return NextResponse.json({ error: (err as Error).message }, { status: 403 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
