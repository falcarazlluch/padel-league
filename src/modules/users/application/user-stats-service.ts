import { prisma } from '@/shared/db/client';

// Estadísticas del jugador: agrega todos los partidos confirmados donde
// participó (vía Team.members en Liga / Torneo / Americana FIXED_PAIRS, vía
// MatchParticipant en Americana ROTATING_INDIVIDUAL) y calcula:
//   - overall: PJ / G / E / P / %V
//   - bestPartners: ranking de compañeros con quienes más ha ganado
//     (mínimo 3 partidos juntos para evitar 1/1 = 100%)
//   - topOpponents: parejas rivales más enfrentadas (con balance H2H)
//   - categoryEvolution: cambios de categoría aceptados sobre cualquier
//     equipo del que el usuario haya sido miembro
//
// Solo se cuentan matches con status CONFIRMED o ADMIN_RESOLVED.

export type PlayerOverall = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  winRate: number; // 0..1
};

export type PartnerStat = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  played: number;
  won: number;
  winRate: number;
};

export type OpponentStat = {
  teamId: string;
  teamName: string;
  played: number;
  won: number; // wins del jugador contra esta pareja
  lost: number;
};

export type CategoryChange = {
  teamId: string;
  teamName: string;
  fromCategory: string;
  toCategory: string;
  reason: string;
  resolvedAt: Date;
};

export type PlayerStats = {
  overall: PlayerOverall;
  bestPartners: PartnerStat[];
  topOpponents: OpponentStat[];
  categoryEvolution: CategoryChange[];
};

const MIN_MATCHES_FOR_PARTNER = 3;
const TOP_N = 5;

export const UserStatsService = {
  /**
   * `organizationId` is a REQUIRED tenant scope (`null` = public platform).
   * Aggregating across tenants would let a RACC profile expose how somebody
   * performs in another club's competitions.
   */
  async getStats(userId: string, organizationId: string | null): Promise<PlayerStats> {
    // 1. Matches basados en Team (Liga / Torneo / Americana FIXED_PAIRS).
    const teamMatches = await prisma.match.findMany({
      where: {
        status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] },
        league: { organizationId },
        teamAId: { not: null },
        teamBId: { not: null },
        OR: [
          { teamA: { members: { some: { userId } } } },
          { teamB: { members: { some: { userId } } } },
        ],
      },
      select: {
        id: true,
        winnerTeamId: true,
        teamAId: true,
        teamBId: true,
        teamA: {
          select: {
            id: true,
            name: true,
            members: {
              select: {
                userId: true,
                user: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        },
        teamB: {
          select: {
            id: true,
            name: true,
            members: {
              select: {
                userId: true,
                user: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    });

    // 2. Matches de Americana ROTATING_INDIVIDUAL — fetch a través de MatchParticipant.
    const americanaParticipations = await prisma.matchParticipant.findMany({
      where: {
        userId,
        match: { status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] }, league: { organizationId } },
      },
      select: {
        matchId: true,
        side: true,
        match: {
          select: {
            confirmedResult: {
              select: { sets: { select: { gamesA: true, gamesB: true } } },
            },
            participants: {
              select: {
                userId: true,
                side: true,
                user: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    });

    // Acumuladores
    let played = 0;
    let won = 0;
    let drawn = 0;
    const partnerMap = new Map<string, { name: string; avatarUrl: string | null; played: number; won: number }>();
    const opponentMap = new Map<string, { teamName: string; played: number; won: number; lost: number }>();

    // -- Team-based matches --
    for (const m of teamMatches) {
      if (!m.teamA || !m.teamB) continue;
      const userOnA = m.teamA.members.some((mb) => mb.userId === userId);
      const myTeam = userOnA ? m.teamA : m.teamB;
      const rivalTeam = userOnA ? m.teamB : m.teamA;

      played++;
      if (m.winnerTeamId === null) drawn++;
      else if (m.winnerTeamId === myTeam.id) won++;

      // Partner = el otro miembro del equipo en este partido. Si el equipo
      // tiene solo al usuario en el roster del momento (raro), se omite.
      const partners = myTeam.members.filter((mb) => mb.userId !== userId);
      for (const p of partners) {
        const key = p.userId;
        const prev = partnerMap.get(key) ?? {
          name: p.user.name,
          avatarUrl: p.user.avatarUrl,
          played: 0,
          won: 0,
        };
        prev.played++;
        if (m.winnerTeamId === myTeam.id) prev.won++;
        partnerMap.set(key, prev);
      }

      // Rival como equipo entero
      const oprev = opponentMap.get(rivalTeam.id) ?? {
        teamName: rivalTeam.name,
        played: 0,
        won: 0,
        lost: 0,
      };
      oprev.played++;
      if (m.winnerTeamId === myTeam.id) oprev.won++;
      else if (m.winnerTeamId === rivalTeam.id) oprev.lost++;
      opponentMap.set(rivalTeam.id, oprev);
    }

    // -- Americana ROTATING_INDIVIDUAL --
    for (const part of americanaParticipations) {
      const mySide = part.side; // 'A' o 'B'
      const sets = part.match.confirmedResult?.sets ?? [];
      const gamesA = sets.reduce((a, s) => a + s.gamesA, 0);
      const gamesB = sets.reduce((a, s) => a + s.gamesB, 0);
      const winnerSide = gamesA > gamesB ? 'A' : gamesB > gamesA ? 'B' : null;

      played++;
      if (winnerSide === null) drawn++;
      else if (winnerSide === mySide) won++;

      // Compañero = el otro participant en mi side.
      const partner = part.match.participants.find(
        (p) => p.side === mySide && p.userId !== userId,
      );
      if (partner) {
        const key = partner.userId;
        const prev = partnerMap.get(key) ?? {
          name: partner.user.name,
          avatarUrl: partner.user.avatarUrl,
          played: 0,
          won: 0,
        };
        prev.played++;
        if (winnerSide === mySide) prev.won++;
        partnerMap.set(key, prev);
      }
      // No agregamos a opponentMap porque en Americana individual no hay
      // "equipo rival" persistente — los rivales son distintos cada ronda.
    }

    const lost = played - won - drawn;
    const winRate = played > 0 ? won / played : 0;

    const bestPartners: PartnerStat[] = [...partnerMap.entries()]
      .filter(([, v]) => v.played >= MIN_MATCHES_FOR_PARTNER)
      .map(([id, v]) => ({
        userId: id,
        name: v.name,
        avatarUrl: v.avatarUrl,
        played: v.played,
        won: v.won,
        winRate: v.won / v.played,
      }))
      .sort((a, b) => {
        if (a.winRate !== b.winRate) return b.winRate - a.winRate;
        if (a.played !== b.played) return b.played - a.played;
        return a.name.localeCompare(b.name);
      })
      .slice(0, TOP_N);

    const topOpponents: OpponentStat[] = [...opponentMap.entries()]
      .map(([id, v]) => ({ teamId: id, teamName: v.teamName, played: v.played, won: v.won, lost: v.lost }))
      .sort((a, b) => {
        if (a.played !== b.played) return b.played - a.played;
        return a.teamName.localeCompare(b.teamName);
      })
      .slice(0, TOP_N);

    // 3. Evolución de categoría: cambios aceptados sobre equipos del usuario.
    const userTeamIds = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const proposals = await prisma.teamCategoryChangeProposal.findMany({
      where: {
        teamId: { in: userTeamIds.map((t) => t.teamId) },
        league: { organizationId },
        status: 'ACCEPTED',
      },
      select: {
        teamId: true,
        team: { select: { name: true } },
        fromCategory: true,
        toCategory: true,
        reason: true,
        resolvedAt: true,
      },
      orderBy: { resolvedAt: 'desc' },
    });
    const categoryEvolution: CategoryChange[] = proposals
      .filter((p): p is typeof p & { resolvedAt: Date } => p.resolvedAt !== null)
      .map((p) => ({
        teamId: p.teamId,
        teamName: p.team.name,
        fromCategory: p.fromCategory,
        toCategory: p.toCategory,
        reason: p.reason,
        resolvedAt: p.resolvedAt,
      }));

    return {
      overall: { played, won, drawn, lost, winRate },
      bestPartners,
      topOpponents,
      categoryEvolution,
    };
  },
};
