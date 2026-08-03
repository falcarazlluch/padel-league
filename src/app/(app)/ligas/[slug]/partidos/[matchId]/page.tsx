import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchService } from '@/modules/leagues';
import { MatchCommentaryService } from '@/modules/match-commentary';
import { MatchPhotoService } from '@/modules/match-photos';
import { PhotosSection } from '@/app/(app)/_components/match-photos/photos-section';
import { prisma } from '@/shared/db/client';
import { getTenant } from '@/shared/tenant/context';
import { SubmitResultForm } from './submit-result-form';
import { ConfirmRejectPanel } from './confirm-reject-panel';
import { ScheduleSection } from './schedule-section';
import { CommentaryAdminActions } from './_components/commentary-admin-actions';
import { CommentaryGenerateButton } from './_components/commentary-generate-button';
import { AddToCalendarButton } from '@/app/(app)/_components/add-to-calendar-button';
import { AmericanaResultForm } from './americana-result-form';
import { SubstituteSlotPanel } from './substitute-slot-panel';
import { WalkoverPanel } from './walkover-panel';

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

  // Probe the shape of the match: if it's Americana ROTATING_INDIVIDUAL
  // (teamA/B null, americanaRound set, MatchParticipant rows) we render a
  // dedicated view that doesn't depend on the classic two-team flow.
  const tenant = await getTenant();
  const probe = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      leagueId: true,
      teamAId: true,
      teamBId: true,
      americanaRound: true,
      americanaCourt: true,
      status: true,
      // organizationId is the tenant guard: a match id from another
      // environment must 404 here rather than render.
      league: { select: { slug: true, name: true, type: true, organizationId: true } },
    },
  });
  if (!probe || probe.league.slug !== slug || probe.league.organizationId !== (tenant?.id ?? null)) {
    notFound();
  }

  if (probe.league.type === 'AMERICANA' && probe.teamAId == null && probe.teamBId == null) {
    return renderAmericanaIndividualMatch(matchId, currentUser.id, probe.league.name, probe.league.slug);
  }

  const match = await MatchService.getMatch(matchId).catch(() => null);
  if (!match || match.leagueSlug !== slug) notFound();

  const [commentaries, leagueRow, activeExtension] = await Promise.all([
    MatchCommentaryService.getByMatch(matchId),
    prisma.league.findUnique({
      where: { id: match.leagueId },
      select: { endDate: true, createdByUserId: true },
    }),
    prisma.deadlineExtensionProposal.findFirst({
      where: { matchId, status: 'PROPOSED' },
      include: {
        proposer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const leagueEndDate = leagueRow?.endDate ?? new Date();
  const isLeagueAdmin =
    currentUser.role === 'SUPER_ADMIN' ||
    (currentUser.role === 'LEAGUE_ADMIN' && leagueRow?.createdByUserId === currentUser.id);

  // Para slots de bracket R0 pre-juego cargamos también la lista de parejas
  // inscritas que NO están ya en el bracket: candidatas a sustituir.
  const bracketInfo = await prisma.match.findUnique({
    where: { id: matchId },
    select: { bracketSide: true, bracketRound: true },
  });
  const isBracketR0 = bracketInfo?.bracketSide != null && bracketInfo?.bracketRound === 0;
  const canSubstituteSlot =
    isLeagueAdmin &&
    isBracketR0 &&
    (match.status === 'SCHEDULED' ||
      match.status === 'DATE_PROPOSED' ||
      match.status === 'DATE_CONFIRMED');

  let availableSubstituteTeams: { id: string; name: string }[] = [];
  if (canSubstituteSlot) {
    // Parejas inscritas en la competición que NO están ya en algún slot del bracket.
    const teamsInBracket = await prisma.match.findMany({
      where: { leagueId: match.leagueId, bracketSide: { not: null } },
      select: { teamAId: true, teamBId: true },
    });
    const idsInBracket = new Set<string>();
    for (const m of teamsInBracket) {
      if (m.teamAId) idsInBracket.add(m.teamAId);
      if (m.teamBId) idsInBracket.add(m.teamBId);
    }
    const candidates = await prisma.leagueRegistration.findMany({
      where: { leagueId: match.leagueId, withdrawnAt: null, teamId: { not: null } },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { team: { name: 'asc' } },
    });
    availableSubstituteTeams = candidates
      .map((r) => r.team)
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .filter((t) => !idsInBracket.has(t.id))
      .map((t) => ({ id: t.id, name: t.name }));
  }

  const teamAIds = match.teamA.members.map((m) => m.userId);
  const teamBIds = match.teamB.members.map((m) => m.userId);
  const currentUserSide = teamAIds.includes(currentUser.id) ? 'A' : teamBIds.includes(currentUser.id) ? 'B' : null;
  const isTeamMember = currentUserSide !== null;

  // eslint-disable-next-line react-hooks/purity -- Server Component; one-shot read.
  const isPast = match.scheduledAt !== null && match.scheduledAt.getTime() < Date.now();

  const SUBMITTABLE = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];
  const canSubmit = isTeamMember && SUBMITTABLE.includes(match.status);

  // Once the agreed date is in the past, scheduling/proposal UI no longer
  // makes sense — the players need to report the result instead.
  const SCHEDULABLE_STATUSES = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];
  const isSchedulable = SCHEDULABLE_STATUSES.includes(match.status) && !isPast;

  let proposalState: 'none' | 'mine' | 'rival' = 'none';
  if (match.activeProposal) {
    const proposerOnTeamA = match.teamA.members.some(
      (m) => m.userId === match.activeProposal!.proposedByUserId,
    );
    const currentUserOnTeamA = currentUserSide === 'A';
    proposalState = proposerOnTeamA === currentUserOnTeamA ? 'mine' : 'rival';
  }

  let extensionState: 'none' | 'mine' | 'rival' = 'none';
  if (activeExtension) {
    const proposerOnA = match.teamA.members.some((m) => m.userId === activeExtension.proposedByUserId);
    const userOnA = currentUserSide === 'A';
    if (proposerOnA === userOnA) extensionState = 'mine';
    else extensionState = 'rival';
  }

  // canValidate: viewer is on a team and either (a) on the OPPOSITE side of
  // the submitter, or (b) the submitter side is unknown (legacy row whose
  // submitter has left both rosters) — in which case either team is allowed
  // to act so the match doesn't deadlock until the auto-approve job fires.
  const canValidate =
    match.status === 'PENDING_VALIDATION' &&
    match.pendingResult !== null &&
    currentUserSide !== null &&
    (match.pendingResult.submitterSide === null ||
      currentUserSide !== match.pendingResult.submitterSide);

  const submitterUnknown =
    match.status === 'PENDING_VALIDATION' &&
    match.pendingResult !== null &&
    match.pendingResult.submitterSide === null;

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
        <h1 className="text-2xl font-extrabold text-brand-navy">
          <Link href={`/equipos/${match.teamA.id}` as Route} className="hover:underline">{match.teamA.name}</Link>
          {' vs '}
          <Link href={`/equipos/${match.teamB.id}` as Route} className="hover:underline">{match.teamB.name}</Link>
        </h1>
      </div>

      {/* AI Commentaries */}
      {(() => {
        const PREVIEW_ELIGIBLE = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED', 'PENDING_VALIDATION'];
        const RECAP_ELIGIBLE = ['CONFIRMED', 'ADMIN_RESOLVED'];
        const showGeneratePreview = isLeagueAdmin && !commentaries.preview && PREVIEW_ELIGIBLE.includes(match.status);
        const showGenerateRecap = isLeagueAdmin && !commentaries.recap && RECAP_ELIGIBLE.includes(match.status);
        const showSection = commentaries.preview || commentaries.recap || showGeneratePreview || showGenerateRecap;

        if (!showSection) return null;
        return (
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
            {showGeneratePreview && (
              <CommentaryGenerateButton matchId={matchId} slug={slug} type="PREVIEW" />
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
            {showGenerateRecap && (
              <CommentaryGenerateButton matchId={matchId} slug={slug} type="RECAP" />
            )}
          </section>
        );
      })()}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 font-bold text-brand-navy text-lg">
            <Link href={`/equipos/${match.teamA.id}` as Route} className="hover:underline">{match.teamA.name}</Link>
            <span className="text-slate-400 font-normal text-sm">vs</span>
            <Link href={`/equipos/${match.teamB.id}` as Route} className="hover:underline">{match.teamB.name}</Link>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-bold ${STATUS_CLASS[match.status] ?? 'bg-gray-100 text-gray-500'}`}
            >
              {STATUS_LABEL[match.status] ?? match.status}
            </span>
            {isPast &&
              match.status !== 'CONFIRMED' &&
              match.status !== 'ADMIN_RESOLVED' &&
              match.status !== 'CANCELLED' &&
              match.status !== 'EXPIRED_UNPLAYED' &&
              match.status !== 'PENDING_VALIDATION' &&
              match.status !== 'DISPUTED' && (
                <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-slate-100 text-slate-500 border border-slate-200">
                  Fecha pasada
                </span>
              )}
          </div>
        </div>
        <p className="text-sm text-slate-400 mt-2">
          Límite: {match.deadlineAt.toLocaleDateString('es-ES')}
          {match.scheduledAt && match.status !== 'EXPIRED_UNPLAYED' && (
            <>
              {' · '}
              {match.confirmedResult ? 'Jugado' : 'Fecha partido'}: {match.scheduledAt.toLocaleDateString('es-ES')}
            </>
          )}
        </p>
        {match.scheduledAt && match.status !== 'CANCELLED' && !isPast && (
          <div className="mt-3">
            <AddToCalendarButton href={`/api/calendar/league-match/${match.id}/event.ics`} />
          </div>
        )}
        {isPast &&
          !match.confirmedResult &&
          match.status !== 'CANCELLED' &&
          match.status !== 'PENDING_VALIDATION' &&
          match.status !== 'EXPIRED_UNPLAYED' && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
              La fecha del partido ya ha pasado. {canSubmit ? 'Informa del resultado más abajo.' : 'A la espera del resultado.'}
            </div>
          )}
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

          {submitterUnknown && canValidate && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              El jugador que envió el resultado ya no figura en ningún equipo del partido. Cualquier miembro de los dos equipos puede validarlo o rechazarlo aquí abajo.
            </p>
          )}

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
          matchDeadlineAt={match.deadlineAt}
          leagueEndDate={leagueEndDate}
          proposalState={proposalState}
          proposedDate={match.activeProposal?.proposedDate ?? null}
          scheduledAt={match.scheduledAt ?? null}
          isTeamMember={isTeamMember}
          extensionState={extensionState}
          activeExtension={activeExtension ? {
            id: activeExtension.id,
            proposedDeadlineAt: activeExtension.proposedDeadlineAt,
            proposerName: activeExtension.proposer.name ?? '',
          } : null}
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

      {/* Photos: postpartido. Only members of either team can see / upload /
          like / comment, gated by the same ACL as the match itself. */}
      {isPast && isTeamMember && (
        <PhotosSection
          matchId={match.id}
          kind="league"
          leagueSlug={slug}
          photos={await MatchPhotoService.list(match.id, 'league', currentUser.id).catch(() => [])}
          canUpload
          currentUserId={currentUser.id}
        />
      )}

      {/* Admin only: sustituir slot inicial del bracket cuando una pareja
          se baja antes de jugar su primer partido. Solo R0 pre-juego. */}
      {canSubstituteSlot && (
        <SubstituteSlotPanel
          matchId={match.id}
          teamAName={match.teamA.name}
          teamBName={match.teamB.name}
          availableTeams={availableSubstituteTeams}
        />
      )}

      {/* Admin only: walkover / no-show. Disponible mientras el match no esté
          finalizado (CONFIRMED / ADMIN_RESOLVED / EXPIRED_UNPLAYED / CANCELLED). */}
      {isLeagueAdmin &&
        match.status !== 'CONFIRMED' &&
        match.status !== 'ADMIN_RESOLVED' &&
        match.status !== 'EXPIRED_UNPLAYED' &&
        match.status !== 'CANCELLED' && (
          <WalkoverPanel
            matchId={match.id}
            teamA={{ id: match.teamA.id, name: match.teamA.name }}
            teamB={{ id: match.teamB.id, name: match.teamB.name }}
          />
        )}
    </div>
  );
}

// ─── Americana ROTATING_INDIVIDUAL — vista dedicada ──────────────────────
// El flujo clásico de Liga (submit-result-form, schedule-section, etc.)
// asume dos equipos con miembros. Aquí mostramos solo lo relevante para una
// ronda de Americana: contexto (ronda + pista), 4 jugadores en 2 parejas, y
// score en games cuando hay resultado. El form de submit/confirm para este
// tipo se cablea en sub-fase 4h.
async function renderAmericanaIndividualMatch(
  matchId: string,
  currentUserId: string,
  leagueName: string,
  _leagueSlug: string,
) {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      league: { select: { slug: true, name: true, status: true } },
      participants: {
        include: { user: { select: { id: true, name: true } } },
      },
      confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
      results: {
        where: { status: 'PENDING' },
        include: { sets: true },
        orderBy: { submittedAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!m) notFound();

  const sideA = m.participants
    .filter((p) => p.side === 'A')
    .sort((a, b) => a.partnerIndex - b.partnerIndex);
  const sideB = m.participants
    .filter((p) => p.side === 'B')
    .sort((a, b) => a.partnerIndex - b.partnerIndex);
  const confirmedSets = m.confirmedResult?.sets ?? [];
  const pendingSets = m.results[0]?.sets ?? [];
  const sets = confirmedSets.length > 0 ? confirmedSets : pendingSets;
  const gamesA = sets.reduce((acc, s) => acc + s.gamesA, 0);
  const gamesB = sets.reduce((acc, s) => acc + s.gamesB, 0);
  const hasResult = sets.length > 0;
  const isParticipant = m.participants.some((p) => p.userId === currentUserId);
  const winnerSide =
    m.status === 'CONFIRMED' || m.status === 'ADMIN_RESOLVED'
      ? gamesA > gamesB
        ? 'A'
        : gamesB > gamesA
          ? 'B'
          : 'DRAW'
      : null;

  // Determinar el modo del formulario.
  const submitterSide = m.results[0]
    ? m.participants.find((p) => p.userId === m.results[0]!.submittedByUserId)?.side ?? null
    : null;
  const mySide = m.participants.find((p) => p.userId === currentUserId)?.side ?? null;

  let formMode: 'submit' | 'confirm' | 'submitter-wait' | 'view' = 'view';
  if (isParticipant) {
    if (m.status === 'SCHEDULED' || m.status === 'DATE_PROPOSED' || m.status === 'DATE_CONFIRMED') {
      formMode = 'submit';
    } else if (m.status === 'PENDING_VALIDATION') {
      if (submitterSide && mySide && mySide !== submitterSide) {
        formMode = 'confirm';
      } else {
        formMode = 'submitter-wait';
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">
          Americana · {leagueName}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-extrabold text-brand-navy">
            Ronda {m.americanaRound} · Pista {m.americanaCourt}
          </h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_CLASS[m.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABEL[m.status] ?? m.status}
          </span>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
        <AmericanaSideRow
          label="Pareja A"
          players={sideA.map((p) => p.user.name)}
          games={hasResult ? gamesA : null}
          highlight={winnerSide === 'A'}
        />
        <div className="border-t border-slate-100" />
        <AmericanaSideRow
          label="Pareja B"
          players={sideB.map((p) => p.user.name)}
          games={hasResult ? gamesB : null}
          highlight={winnerSide === 'B'}
        />
      </section>

      <AmericanaResultForm
        matchId={matchId}
        mode={formMode}
        pendingGames={
          formMode === 'confirm' && pendingSets.length > 0
            ? { gamesA, gamesB }
            : undefined
        }
        isParticipant={isParticipant}
      />
    </div>
  );
}

function AmericanaSideRow({
  label,
  players,
  games,
  highlight,
}: {
  label: string;
  players: string[];
  games: number | null;
  highlight: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
        highlight ? 'bg-emerald-50' : ''
      }`}
    >
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
        <p className={`text-sm font-medium ${highlight ? 'text-emerald-800' : 'text-slate-800'}`}>
          {players.join(' + ')}
        </p>
      </div>
      <p
        className={`text-2xl font-extrabold font-mono ${
          highlight ? 'text-emerald-700' : games !== null ? 'text-slate-700' : 'text-slate-300'
        }`}
      >
        {games ?? '—'}
      </p>
    </div>
  );
}
