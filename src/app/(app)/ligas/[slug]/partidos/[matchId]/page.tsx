import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchService } from '@/modules/leagues';
import { MatchCommentaryService } from '@/modules/match-commentary';
import { prisma } from '@/shared/db/client';
import { SubmitResultForm } from './submit-result-form';
import { ConfirmRejectPanel } from './confirm-reject-panel';
import { ScheduleSection } from './schedule-section';
import { CommentaryAdminActions } from './_components/commentary-admin-actions';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Pendiente',
  DATE_PROPOSED: 'Fecha propuesta',
  DATE_CONFIRMED: 'Fecha confirmada',
  PENDING_VALIDATION: 'Resultado enviado',
  CONFIRMED: 'Confirmado',
  ADMIN_RESOLVED: 'Resuelto por admin',
  DISPUTED: 'En disputa',
  EXPIRED_UNPLAYED: 'No jugado',
  CANCELLED: 'Cancelado',
};

const STATUS_CLASS: Record<string, string> = {
  SCHEDULED: 'bg-gray-100 text-gray-500',
  DATE_PROPOSED: 'bg-gradient-to-r from-yellow-50 to-amber-100 text-amber-700',
  DATE_CONFIRMED: 'bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700',
  PENDING_VALIDATION: 'bg-gradient-to-r from-yellow-50 to-amber-100 text-amber-700',
  CONFIRMED: 'bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-700',
  ADMIN_RESOLVED: 'bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700',
  DISPUTED: 'bg-gradient-to-r from-red-50 to-rose-100 text-red-600',
  EXPIRED_UNPLAYED: 'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ slug: string; matchId: string }>;
}) {
  const { slug, matchId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);

  const currentUser = await getValidatedSession(token).catch(() => redirect('/login' as Route));
  const match = await MatchService.getMatch(matchId).catch(() => null);
  if (!match || match.leagueSlug !== slug) notFound();

  const [commentaries, isLeagueAdmin] = await Promise.all([
    MatchCommentaryService.getByMatch(matchId),
    prisma.leagueMember.findFirst({
      where: { leagueId: match.leagueId, userId: currentUser.id, role: 'LEAGUE_ADMIN' },
    }).then((m) => !!m),
  ]);

  const teamAIds = match.teamA.members.map((m) => m.userId);
  const teamBIds = match.teamB.members.map((m) => m.userId);
  const currentUserSide = teamAIds.includes(currentUser.id) ? 'A' : teamBIds.includes(currentUser.id) ? 'B' : null;
  const isTeamMember = currentUserSide !== null;

  const SUBMITTABLE = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];
  const canSubmit = isTeamMember && SUBMITTABLE.includes(match.status);

  const SCHEDULABLE_STATUSES = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];
  const isSchedulable = SCHEDULABLE_STATUSES.includes(match.status);

  let proposalState: 'none' | 'mine' | 'rival' = 'none';
  if (match.activeProposal) {
    const proposerOnTeamA = match.teamA.members.some(
      (m) => m.userId === match.activeProposal!.proposedByUserId,
    );
    const currentUserOnTeamA = currentUserSide === 'A';
    proposalState = proposerOnTeamA === currentUserOnTeamA ? 'mine' : 'rival';
  }

  const canValidate =
    match.status === 'PENDING_VALIDATION' &&
    match.pendingResult !== null &&
    currentUserSide !== null &&
    match.pendingResult.submitterSide !== null &&
    currentUserSide !== match.pendingResult.submitterSide;

  const isAwaitingOwnConfirmation =
    match.status === 'PENDING_VALIDATION' &&
    match.pendingResult !== null &&
    currentUserSide !== null &&
    match.pendingResult.submitterSide !== null &&
    currentUserSide === match.pendingResult.submitterSide;

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Back link */}
      <Link
        href={`/ligas/${slug}` as Route}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        ← Volver a la liga
      </Link>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Partido</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">{match.teamA.name} vs {match.teamB.name}</h1>
      </div>

      {/* AI Commentaries */}
      {(commentaries.preview || commentaries.recap) && (
        <section className="space-y-3">
          {commentaries.preview && (
            <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
              <header className="flex items-baseline justify-between mb-2">
                <h2 className="text-xs font-bold text-brand-blue uppercase tracking-widest" title="Generado por IA">
                  ✨ Previa
                </h2>
                <time className="text-xs text-slate-400">
                  {commentaries.preview.generatedAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </time>
              </header>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {commentaries.preview.content}
              </p>
              {isLeagueAdmin && (
                <CommentaryAdminActions
                  commentaryId={commentaries.preview.id}
                  matchId={matchId}
                  slug={slug}
                  currentContent={commentaries.preview.content}
                />
              )}
            </article>
          )}
          {commentaries.recap && (
            <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
              <header className="flex items-baseline justify-between mb-2">
                <h2 className="text-xs font-bold text-brand-blue uppercase tracking-widest" title="Generado por IA">
                  ✨ Crónica
                </h2>
                <time className="text-xs text-slate-400">
                  {commentaries.recap.generatedAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </time>
              </header>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {commentaries.recap.content}
              </p>
              {isLeagueAdmin && (
                <CommentaryAdminActions
                  commentaryId={commentaries.recap.id}
                  matchId={matchId}
                  slug={slug}
                  currentContent={commentaries.recap.content}
                />
              )}
            </article>
          )}
        </section>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 font-bold text-brand-navy text-lg">
            <span>{match.teamA.name}</span>
            <span className="text-slate-400 font-normal text-sm">vs</span>
            <span>{match.teamB.name}</span>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold ${STATUS_CLASS[match.status] ?? 'bg-gray-100 text-gray-500'}`}
          >
            {STATUS_LABEL[match.status] ?? match.status}
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-2">
          Límite: {match.deadlineAt.toLocaleDateString('es-ES')}
          {match.scheduledAt && (
            <> · Jugado: {match.scheduledAt.toLocaleDateString('es-ES')}</>
          )}
        </p>
      </div>

      {/* Confirmed result */}
      {match.confirmedResult && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <h3 className="font-bold text-brand-navy mb-3">Resultado final</h3>
          <div className="space-y-2">
            {match.confirmedResult.sets.map((s) => (
              <div
                key={s.setNumber}
                className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-center"
              >
                <span
                  className={`text-lg font-bold ${s.gamesA > s.gamesB ? 'text-green-600' : 'text-gray-400'}`}
                >
                  {s.gamesA}
                </span>
                <span className="text-xs text-gray-400">Set {s.setNumber}</span>
                <span
                  className={`text-lg font-bold ${s.gamesB > s.gamesA ? 'text-green-600' : 'text-gray-400'}`}
                >
                  {s.gamesB}
                </span>
              </div>
            ))}
          </div>
          {match.confirmedResult.winnerTeamId ? (
            <p className="text-sm text-green-700 font-medium mt-3 text-center">
              Ganador:{' '}
              {match.confirmedResult.winnerTeamId === match.teamAId
                ? match.teamA.name
                : match.teamB.name}
            </p>
          ) : (
            <p className="text-sm text-gray-500 font-medium mt-3 text-center">Empate</p>
          )}
        </div>
      )}

      {/* Pending result awaiting validation */}
      {match.pendingResult && match.status === 'PENDING_VALIDATION' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-brand-navy">
            Resultado enviado — pendiente de validación
          </h3>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-xs font-medium text-gray-500 text-center">
              <span>{match.teamA.name}</span>
              <span />
              <span>{match.teamB.name}</span>
            </div>
            {match.pendingResult.sets.map((s) => (
              <div
                key={s.setNumber}
                className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-center"
              >
                <span className="text-lg font-bold text-gray-900">{s.gamesA}</span>
                <span className="text-xs text-gray-400">Set {s.setNumber}</span>
                <span className="text-lg font-bold text-gray-900">{s.gamesB}</span>
              </div>
            ))}
          </div>

          {canValidate && <ConfirmRejectPanel matchId={match.id} />}

          {isAwaitingOwnConfirmation && (
            <p className="text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
              Resultado enviado. Esperando confirmación del equipo rival.
            </p>
          )}
        </div>
      )}

      {/* Schedule section */}
      {isSchedulable && (
        <ScheduleSection
          matchId={match.id}
          slug={slug}
          matchStatus={match.status}
          proposalState={proposalState}
          proposedDate={match.activeProposal?.proposedDate ?? null}
          scheduledAt={match.scheduledAt ?? null}
          isTeamMember={isTeamMember}
        />
      )}

      {/* Submit result form */}
      {canSubmit && (
        <SubmitResultForm
          matchId={match.id}
          teamAName={match.teamA.name}
          teamBName={match.teamB.name}
        />
      )}

      {/* Disputed state */}
      {match.status === 'DISPUTED' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <h3 className="font-bold text-red-800 mb-1">Partido en disputa</h3>
          <p className="text-sm text-red-600">
            El resultado ha sido disputado. Un administrador resolverá la disputa.
          </p>
        </div>
      )}
    </div>
  );
}
