import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import {
  BLOCKED_MESSAGE,
  EnrollmentService,
  InviteLinkService,
} from '@/modules/organizations';
import { WizardSteps, stepsFor, type StepKey } from '../_components/wizard-steps';
import { CompetitionSummary } from '../_components/competition-summary';
import { OrganizationSummary } from '../_components/organization-summary';
import { StartStep } from '../_components/start-step';
import { AuthStep } from '../_components/auth-step';
import { PickCompetitionStep } from '../_components/pick-competition-step';
import { ProfileStep } from '../_components/profile-step';
import { PartnerStep } from '../_components/partner-step';
import { DoneStep } from '../_components/done-step';
import { BlockedNotice } from '../_components/blocked-notice';

// The wizard reads and writes live enrolment state on every request; caching it
// would be the one thing guaranteed to make a player doubt whether they are in.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const preview = await InviteLinkService.preview(token);
  if (!preview) return { title: 'Inscripción no disponible' };
  const title =
    preview.kind === 'COMPETITION' && preview.competition
      ? `Inscripción · ${preview.competition.name}`
      : `Inscripción · ${preview.organization.name}`;
  return {
    title,
    // An inscription link is private: keep it out of search indexes even if
    // someone posts it publicly.
    robots: { index: false, follow: false },
  };
}

export default async function InscripcionWizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paso?: string; liga?: string }>;
}) {
  const { token } = await params;
  const { paso, liga } = await searchParams;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  const currentUser = sessionToken
    ? await getValidatedSession(sessionToken).catch(() => null)
    : null;

  const preview = await InviteLinkService.preview(token, new Date(), currentUser?.id);
  if (!preview) notFound();

  const steps = stepsFor(preview.kind);
  const idx = (key: StepKey) => steps.indexOf(key) + 1;
  const hrefFor = (step: number, slug?: string | null) => {
    const q = new URLSearchParams({ paso: String(step) });
    if (slug) q.set('liga', slug);
    return `/inscripcion/${token}?${q.toString()}`;
  };

  // ── Which competition are we enrolling into? ──────────────────────────────
  // A competition link fixes it. An organization link takes it from `?liga=`,
  // and only accepts a slug that is actually in its open list — otherwise a
  // hand-edited URL could point at another club's competition.
  const selected =
    preview.kind === 'COMPETITION'
      ? preview.competition
        ? { id: preview.competition.id, slug: preview.competition.slug, name: preview.competition.name }
        : null
      : (preview.openCompetitions.find((c) => c.slug === liga) ?? null);

  // ── Enrolment state, once we know the user and the competition ────────────
  const view =
    currentUser && selected
      ? await EnrollmentService.getView(selected.id, currentUser.id)
      : null;
  const started = view !== null && view.status !== 'NOT_STARTED' && view.status !== 'CANCELLED';

  // ── Furthest reachable step ───────────────────────────────────────────────
  let reachable: number;
  if (!currentUser) reachable = idx('auth');
  else if (!selected) reachable = idx(preview.kind === 'ORGANIZATION' ? 'pick' : 'auth');
  else if (!started) reachable = idx('profile');
  else if (!view.profileComplete) reachable = idx('profile');
  else reachable = idx('done');

  const requested = paso ? Number.parseInt(paso, 10) : NaN;
  let current = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), reachable)
    : Math.min(reachable, idx('intro'));

  // A completed enrolment always lands on the status screen rather than being
  // walked back through the steps by a stale `?paso=`.
  if (view?.status === 'COMPLETED') current = idx('done');

  const stepKey = steps[current - 1]!;
  const introLabel = preview.kind === 'ORGANIZATION' ? 'El club' : 'El torneo';

  // The blocking reason still matters mid-wizard: a window can close while the
  // tab is open. Completed enrolments are unaffected.
  const showBlocked = preview.blockedReason !== null && view?.status !== 'COMPLETED';

  return (
    <div className="space-y-6">
      <WizardSteps
        steps={steps}
        current={current}
        reachable={reachable}
        hrefFor={(n) => hrefFor(n, selected?.slug)}
        introLabel={introLabel}
      />

      {showBlocked && <BlockedNotice message={BLOCKED_MESSAGE[preview.blockedReason!]} />}

      {stepKey === 'intro' && (
        <div className="space-y-6">
          {preview.kind === 'ORGANIZATION' ? (
            <OrganizationSummary
              organization={preview.organization}
              openCompetitions={preview.openCompetitions}
            />
          ) : (
            <CompetitionSummary
              organizationName={preview.organization.name}
              competition={preview.competition!}
            />
          )}
          <StartStep
            nextHref={hrefFor(idx('auth'), selected?.slug)}
            disabled={preview.blockedReason !== null}
            kind={preview.kind}
            playerName={currentUser?.name ?? null}
            resuming={started}
          />
        </div>
      )}

      {stepKey === 'auth' && (
        <AuthStep
          token={token}
          nextHref={hrefFor(
            idx(preview.kind === 'ORGANIZATION' ? 'pick' : 'profile'),
            selected?.slug,
          )}
          currentUser={currentUser ? { name: currentUser.name, email: currentUser.email } : null}
          organizationName={preview.organization.name}
        />
      )}

      {stepKey === 'pick' && (
        <PickCompetitionStep
          token={token}
          competitions={preview.openCompetitions}
          organizationName={preview.organization.name}
        />
      )}

      {stepKey === 'profile' && currentUser && selected && (
        <ProfileStepLoader
          token={token}
          userId={currentUser.id}
          leagueId={selected.id}
          leagueSlug={selected.slug}
          nextStep={idx('partner')}
        />
      )}

      {stepKey === 'partner' && currentUser && selected && view && (
        <PartnerStepLoader
          token={token}
          userId={currentUser.id}
          organizationId={preview.organization.id}
          league={selected}
          nextStep={idx('done')}
          pendingInvite={view.pendingInvite}
          myName={currentUser.name}
        />
      )}

      {stepKey === 'done' && selected && view && (
        <DoneStep
          token={token}
          leagueId={selected.id}
          competitionName={selected.name}
          competitionSlug={selected.slug}
          checklist={view.checklist}
          status={view.status}
          teamName={view.team?.name ?? null}
          partnerStepHref={hrefFor(idx('partner'), selected.slug)}
          pendingInvite={
            view.pendingInvite
              ? {
                  invitedName: view.pendingInvite.invitedName,
                  invitedEmail: view.pendingInvite.invitedEmail,
                  shareUrl: view.pendingInvite.shareUrl,
                  expiresAt: view.pendingInvite.expiresAt.toISOString(),
                }
              : null
          }
        />
      )}

      {selected && (
        <p className="text-center text-xs text-slate-400">
          Puedes cerrar esta página y volver cuando quieras:{' '}
          <Link
            href={`/inscripcion/estado/${selected.slug}` as Route}
            className="underline hover:text-slate-600"
          >
            consulta el estado de tu inscripción
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/** Loads the profile defaults for step "profile". */
async function ProfileStepLoader({
  token,
  userId,
  leagueId,
  leagueSlug,
  nextStep,
}: {
  token: string;
  userId: string;
  leagueId: string;
  leagueSlug: string;
  nextStep: number;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, phone: true, category: true, email: true },
  });
  return (
    <ProfileStep
      token={token}
      leagueId={leagueId}
      leagueSlug={leagueSlug}
      nextStep={nextStep}
      defaultName={user?.name ?? ''}
      defaultPhone={user?.phone ?? ''}
      defaultCategory={user?.category ?? 'INTERMEDIATE'}
      email={user?.email ?? ''}
    />
  );
}

/** Loads the eligible pairs for step "partner". */
async function PartnerStepLoader({
  token,
  userId,
  organizationId,
  league,
  nextStep,
  pendingInvite,
  myName,
}: {
  token: string;
  userId: string;
  organizationId: string;
  league: { id: string; slug: string; name: string };
  nextStep: number;
  pendingInvite: NonNullable<Awaited<ReturnType<typeof EnrollmentService.getView>>>['pendingInvite'];
  myName: string;
}) {
  // Only pairs of this tenant, already complete, and not yet in this
  // competition — anything else would be a dead end in the partner step.
  const teams = await prisma.team.findMany({
    where: { organizationId, members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      members: { select: { user: { select: { id: true, name: true } } } },
      registrations: { where: { leagueId: league.id }, select: { withdrawnAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const eligibleTeams = teams
    .filter((t) => t.members.length === 2)
    .filter((t) => !t.registrations.some((r) => r.withdrawnAt === null))
    .map((t) => ({
      id: t.id,
      name: t.name,
      partnerName: t.members.find((m) => m.user.id !== userId)?.user.name ?? 'Tu compañero/a',
    }));

  return (
    <PartnerStep
      token={token}
      leagueId={league.id}
      leagueSlug={league.slug}
      nextStep={nextStep}
      competitionName={league.name}
      myName={myName}
      eligibleTeams={eligibleTeams}
      pendingInvite={
        pendingInvite
          ? {
              invitedName: pendingInvite.invitedName,
              shareUrl: pendingInvite.shareUrl,
              expiresAt: pendingInvite.expiresAt.toISOString(),
            }
          : null
      }
    />
  );
}
