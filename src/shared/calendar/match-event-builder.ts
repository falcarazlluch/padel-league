import { prisma } from '@/shared/db/client';
import { env } from '@/shared/config/env';
import type { CalendarEvent } from './types';

const DEFAULT_DURATION_MINUTES = 90;
const DEFAULT_ALARM_MINUTES = 60;

export type BuildResult =
  | { kind: 'ok'; event: CalendarEvent; filename: string }
  | { kind: 'not-found' }
  | { kind: 'forbidden' }
  | { kind: 'no-date' };

function makeFilename(slug: string): string {
  // Conservative ASCII filename — strip diacritics + non-alphanumerics.
  const cleaned = slug
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return `${cleaned || 'partido'}.ics`;
}

export async function buildIndependentMatchEvent(matchId: string, callerUserId: string): Promise<BuildResult> {
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    include: {
      organizer: { select: { id: true, name: true } },
      participants: {
        where: { status: 'ACCEPTED' },
        include: { user: { select: { id: true, name: true } } },
      },
      invitations: {
        where: { acceptedAt: null },
        select: { invitedUserId: true, invitedTeamId: true, expiresAt: true },
      },
      hostTeam: { select: { id: true, members: { select: { userId: true } } } },
    },
  });
  if (!match) return { kind: 'not-found' };
  if (!match.scheduledAt) return { kind: 'no-date' };

  if (match.visibility === 'PRIVATE') {
    const isOrganizer = match.organizerId === callerUserId;
    const isParticipant = match.participants.some((p) => p.user.id === callerUserId);
    const isInvitedUser = match.invitations.some(
      (i) => i.invitedUserId === callerUserId && i.expiresAt > new Date(),
    );
    const teamInviteIds = match.invitations
      .filter((i) => i.invitedTeamId !== null && i.expiresAt > new Date())
      .map((i) => i.invitedTeamId as string);
    const isHostTeamMember = match.hostTeam?.members.some((m) => m.userId === callerUserId) ?? false;

    let isInvitedTeamMember = false;
    if (teamInviteIds.length > 0) {
      const member = await prisma.teamMember.findFirst({
        where: { userId: callerUserId, teamId: { in: teamInviteIds } },
        select: { id: true },
      });
      isInvitedTeamMember = !!member;
    }

    if (!isOrganizer && !isParticipant && !isInvitedUser && !isHostTeamMember && !isInvitedTeamMember) {
      return { kind: 'forbidden' };
    }
  }

  const participantNames = match.participants.map((p) => p.user.name);
  const description =
    `Organiza ${match.organizer.name}` +
    (participantNames.length > 0 ? `\nParticipantes: ${participantNames.join(', ')}` : '') +
    `\n\nVer en la app: ${env().APP_URL}/jugar/${match.id}`;

  const event: CalendarEvent = {
    uid: `match-${match.id}@padelleague.app`,
    sequence: Math.floor(match.updatedAt.getTime() / 1000),
    summary: match.name,
    description,
    location: match.location,
    url: `${env().APP_URL}/jugar/${match.id}`,
    startUtc: match.scheduledAt,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    alarmMinutes: DEFAULT_ALARM_MINUTES,
  };

  return { kind: 'ok', event, filename: makeFilename(match.name) };
}

export async function buildLeagueMatchEvent(matchId: string, callerUserId: string): Promise<BuildResult> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: {
        include: { members: { include: { user: { select: { id: true, name: true } } } } },
      },
      teamB: {
        include: { members: { include: { user: { select: { id: true, name: true } } } } },
      },
      league: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!match) return { kind: 'not-found' };
  if (!match.scheduledAt) return { kind: 'no-date' };
  // Solo soporta Liga / Torneo / Americana FIXED_PAIRS (matches con dos
  // equipos). Para Americana ROTATING_INDIVIDUAL devolvemos not-found hasta
  // que se implemente un builder específico.
  if (match.teamA == null || match.teamB == null) return { kind: 'not-found' };
  const teamA = match.teamA;
  const teamB = match.teamB;

  // ACL: a league match's ICS exposes the full roster of both teams. Restrict
  // to people who actually belong to the league (any team registered in it),
  // plus SUPER_ADMINs, plus the league admin. Everybody else gets `forbidden`.
  const isParticipantOnEither =
    teamA.members.some((m) => m.userId === callerUserId) ||
    teamB.members.some((m) => m.userId === callerUserId);
  if (!isParticipantOnEither) {
    const caller = await prisma.user.findUnique({
      where: { id: callerUserId },
      select: { role: true },
    });
    const isSuperAdmin = caller?.role === 'SUPER_ADMIN';
    if (!isSuperAdmin) {
      const leagueRow = await prisma.league.findUnique({
        where: { id: match.league.id },
        select: { createdByUserId: true },
      });
      const isLeagueAdmin = leagueRow?.createdByUserId === callerUserId;
      if (!isLeagueAdmin) {
        const registeredInLeague = await prisma.leagueRegistration.findFirst({
          where: {
            leagueId: match.league.id,
            withdrawnAt: null,
            team: { members: { some: { userId: callerUserId } } },
          },
          select: { id: true },
        });
        if (!registeredInLeague) return { kind: 'forbidden' };
      }
    }
  }

  const teamARoster = teamA.members.map((m) => m.user.name).join(', ');
  const teamBRoster = teamB.members.map((m) => m.user.name).join(', ');
  const description =
    `${teamA.name}: ${teamARoster}\n${teamB.name}: ${teamBRoster}\n\nLiga: ${match.league.name}\n\nVer en la app: ${env().APP_URL}/ligas/${match.league.slug}/partidos/${match.id}`;

  const event: CalendarEvent = {
    uid: `match-${match.id}@padelleague.app`,
    sequence: Math.floor(match.updatedAt.getTime() / 1000),
    summary: `${teamA.name} vs ${teamB.name}`,
    description,
    location: null, // league `Match` model has no location field today.
    url: `${env().APP_URL}/ligas/${match.league.slug}/partidos/${match.id}`,
    startUtc: match.scheduledAt,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    alarmMinutes: DEFAULT_ALARM_MINUTES,
  };

  return { kind: 'ok', event, filename: makeFilename(`${teamA.name}-vs-${teamB.name}`) };
}
