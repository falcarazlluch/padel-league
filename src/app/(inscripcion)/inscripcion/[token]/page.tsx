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
import { WizardSteps } from '../_components/wizard-steps';
import { CompetitionSummary } from '../_components/competition-summary';
import { StartStep } from '../_components/start-step';
import { ProfileStep } from '../_components/profile-step';
import { PartnerStep } from '../_components/partner-step';
import { DoneStep } from '../_components/done-step';
import { AuthGateStep } from '../_components/auth-gate-step';
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
  return {
    title: `Inscripción · ${preview.competition.name}`,
    description: `Apúntate a ${preview.competition.name} — ${preview.organization.name}.`,
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
  searchParams: Promise<{ paso?: string }>;
}) {
  const { token } = await params;
  const { paso } = await searchParams;

  const preview = await InviteLinkService.preview(token);
  if (!preview) notFound();

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  const currentUser = sessionToken
    ? await getValidatedSession(sessionToken).catch(() => null)
    : null;

  // Not logged in → show what they're joining, then send them to register or
  // sign in. The invite token travels along so registro needs no separate code
  // and login comes straight back here.
  if (!currentUser) {
    return (
      <div className="space-y-6">
        <CompetitionSummary preview={preview} />
        {preview.blockedReason ? (
          <BlockedNotice message={BLOCKED_MESSAGE[preview.blockedReason]} />
        ) : (
          <AuthGateStep token={token} organizationName={preview.organization.name} />
        )}
      </div>
    );
  }

  const view = await EnrollmentService.getView(preview.competition.id, currentUser.id);
  const started = view.status !== 'NOT_STARTED' && view.status !== 'CANCELLED';

  // Step 4 is the status screen, not a reward: it is reachable as soon as the
  // enrolment exists so an unfinished player can always see what is missing.
  // Step 3 is the only one with a hard prerequisite (the profile), and a player
  // already fully in is never pushed back by a stale `?paso=` in their history.
  const requested = clampStep(paso);
  const step: 1 | 2 | 3 | 4 = !started
    ? 1
    : view.status === 'COMPLETED'
      ? 4
      : resolveStep(requested ?? view.currentStep, view.profileComplete);

  const [userProfile, userTeams] = await Promise.all([
    prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { name: true, phone: true, category: true, email: true },
    }),
    // Only pairs of this tenant, already complete, and not yet in this
    // competition — anything else would be a dead end in step 3.
    prisma.team.findMany({
      where: {
        organizationId: preview.organization.id,
        members: { some: { userId: currentUser.id } },
      },
      select: {
        id: true,
        name: true,
        members: { select: { user: { select: { id: true, name: true } } } },
        registrations: { where: { leagueId: preview.competition.id }, select: { withdrawnAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const eligibleTeams = userTeams
    .filter((t) => t.members.length === 2)
    .filter((t) => !t.registrations.some((r) => r.withdrawnAt === null))
    .map((t) => ({
      id: t.id,
      name: t.name,
      partnerName:
        t.members.find((m) => m.user.id !== currentUser.id)?.user.name ?? 'Tu compañero/a',
    }));

  return (
    <div className="space-y-6">
      <WizardSteps current={step} reachable={started ? 4 : 1} token={token} />

      {/* The blocking reason still matters mid-wizard: the window can close
          while a player has the tab open. Completed enrolments are unaffected. */}
      {preview.blockedReason && view.status !== 'COMPLETED' && (
        <BlockedNotice message={BLOCKED_MESSAGE[preview.blockedReason]} />
      )}

      {step === 1 && (
        <div className="space-y-6">
          <CompetitionSummary preview={preview} />
          <StartStep
            token={token}
            resuming={started}
            disabled={preview.blockedReason !== null}
            playerName={currentUser.name}
          />
        </div>
      )}

      {step === 2 && (
        <ProfileStep
          token={token}
          defaultName={userProfile?.name ?? ''}
          defaultPhone={userProfile?.phone ?? ''}
          defaultCategory={userProfile?.category ?? 'INTERMEDIATE'}
          email={userProfile?.email ?? ''}
        />
      )}

      {step === 3 && (
        <PartnerStep
          token={token}
          leagueId={preview.competition.id}
          competitionName={preview.competition.name}
          myName={userProfile?.name ?? currentUser.name}
          eligibleTeams={eligibleTeams}
          pendingInvite={
            view.pendingInvite
              ? {
                  invitedName: view.pendingInvite.invitedName,
                  shareUrl: view.pendingInvite.shareUrl,
                  expiresAt: view.pendingInvite.expiresAt.toISOString(),
                }
              : null
          }
        />
      )}

      {step === 4 && (
        <DoneStep
          token={token}
          leagueId={preview.competition.id}
          competitionName={preview.competition.name}
          competitionSlug={preview.competition.slug}
          checklist={view.checklist}
          status={view.status}
          teamName={view.team?.name ?? null}
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

      <p className="text-center text-xs text-slate-400">
        Puedes cerrar esta página y volver cuando quieras:{' '}
        <Link
          href={`/inscripcion/estado/${preview.competition.slug}` as Route}
          className="underline hover:text-slate-600"
        >
          consulta el estado de tu inscripción
        </Link>
        .
      </p>
    </div>
  );
}

function clampStep(raw: string | undefined): 1 | 2 | 3 | 4 | null {
  if (raw === '1') return 1;
  if (raw === '2') return 2;
  if (raw === '3') return 3;
  if (raw === '4') return 4;
  return null;
}

/** Choosing a partner needs the profile done first; nothing else is gated. */
function resolveStep(want: 1 | 2 | 3 | 4, profileComplete: boolean): 1 | 2 | 3 | 4 {
  if (want === 3 && !profileComplete) return 2;
  return want;
}
