/**
 * Seed de DEMO para validación funcional. Idempotente por email del usuario
 * y por slug de competición — re-ejecutable sin duplicar.
 *
 * Crea ~25 usuarios, ~16 equipos y 5 competiciones (1 Liga 8 equipos, 1 Torneo
 * 8 equipos con grupos, 1 Torneo 8 equipos sin grupos, 1 Americana
 * FIXED_PAIRS 6 parejas, 1 Americana ROTATING_INDIVIDUAL 8 jugadores) +
 * partidos sueltos pasados y futuros. Bypass del service layer para no
 * disparar notificaciones / jobs / cron en producción.
 *
 * Uso:
 *   DATABASE_URL=<prod-url> pnpm tsx prisma/seed-demo.ts
 *
 * Demo user al final del script — credenciales se imprimen por stdout.
 */

import { PrismaClient, TeamCategory, MatchStatus, BracketSide } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

const ARGON2_OPTS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const;

// ─── Constantes demo ──────────────────────────────────────────────────────

const DEMO_EMAIL = 'demo@padelleague.app';
const DEMO_PASSWORD = 'DemoPass2026!';
const DEMO_NAME = 'Demo Player';

const NOW = new Date();
const ONE_DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * ONE_DAY);
const daysFromNow = (n: number): Date => new Date(NOW.getTime() + n * ONE_DAY);

// ─── Catálogo de usuarios sintéticos ──────────────────────────────────────

const SYNTHETIC_USERS: Array<{ email: string; name: string; category: TeamCategory }> = [
  // Intermedios (compañeros del demo)
  { email: 'ana.garcia@demo.padelleague.app', name: 'Ana García', category: 'INTERMEDIATE' },
  { email: 'bruno.lopez@demo.padelleague.app', name: 'Bruno López', category: 'INTERMEDIATE' },
  { email: 'carla.martin@demo.padelleague.app', name: 'Carla Martín', category: 'INTERMEDIATE' },
  // Resto INTERMEDIATE (rivales del demo en liga / torneo)
  { email: 'david.ruiz@demo.padelleague.app', name: 'David Ruiz', category: 'INTERMEDIATE' },
  { email: 'elena.perez@demo.padelleague.app', name: 'Elena Pérez', category: 'INTERMEDIATE' },
  { email: 'fer.diaz@demo.padelleague.app', name: 'Fer Díaz', category: 'INTERMEDIATE' },
  { email: 'gabi.romero@demo.padelleague.app', name: 'Gabi Romero', category: 'INTERMEDIATE' },
  { email: 'hugo.silva@demo.padelleague.app', name: 'Hugo Silva', category: 'INTERMEDIATE' },
  { email: 'ines.vega@demo.padelleague.app', name: 'Inés Vega', category: 'INTERMEDIATE' },
  { email: 'javi.mora@demo.padelleague.app', name: 'Javi Mora', category: 'INTERMEDIATE' },
  { email: 'lola.nieto@demo.padelleague.app', name: 'Lola Nieto', category: 'INTERMEDIATE' },
  { email: 'marc.cano@demo.padelleague.app', name: 'Marc Cano', category: 'INTERMEDIATE' },
  { email: 'noa.bravo@demo.padelleague.app', name: 'Noa Bravo', category: 'INTERMEDIATE' },
  { email: 'oscar.lima@demo.padelleague.app', name: 'Óscar Lima', category: 'INTERMEDIATE' },
  { email: 'paula.iglesias@demo.padelleague.app', name: 'Paula Iglesias', category: 'INTERMEDIATE' },
  { email: 'quim.feliu@demo.padelleague.app', name: 'Quim Feliú', category: 'INTERMEDIATE' },
  // Avanzados
  { email: 'raul.castro@demo.padelleague.app', name: 'Raúl Castro', category: 'ADVANCED' },
  { email: 'sofia.lara@demo.padelleague.app', name: 'Sofía Lara', category: 'ADVANCED' },
  { email: 'tomas.olid@demo.padelleague.app', name: 'Tomás Olid', category: 'ADVANCED' },
  { email: 'uxue.gil@demo.padelleague.app', name: 'Uxue Gil', category: 'ADVANCED' },
  // Principiantes
  { email: 'victor.benet@demo.padelleague.app', name: 'Víctor Benet', category: 'BEGINNER' },
  { email: 'wendy.soto@demo.padelleague.app', name: 'Wendy Soto', category: 'BEGINNER' },
  { email: 'xavi.peral@demo.padelleague.app', name: 'Xavi Peral', category: 'BEGINNER' },
  { email: 'yael.rico@demo.padelleague.app', name: 'Yael Rico', category: 'BEGINNER' },
];

// ─── Utilidades ───────────────────────────────────────────────────────────

async function ensureUser(args: {
  email: string;
  name: string;
  category: TeamCategory;
  passwordHash: string;
}): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: args.email },
    select: { id: true },
  });
  if (existing) return existing.id;
  const u = await prisma.user.create({
    data: {
      email: args.email,
      name: args.name,
      category: args.category,
      passwordHash: args.passwordHash,
      emailVerifiedAt: NOW,
    },
    select: { id: true },
  });
  return u.id;
}

async function ensureTeam(args: {
  name: string;
  category: TeamCategory;
  memberUserIds: [string, string];
  createdByUserId: string;
}): Promise<string> {
  // El UNIQUE de Team es (createdByUserId, name) — buscamos por ese par.
  const existing = await prisma.team.findFirst({
    where: { createdByUserId: args.createdByUserId, name: args.name },
    select: { id: true },
  });
  if (existing) return existing.id;
  const t = await prisma.team.create({
    data: {
      name: args.name,
      category: args.category,
      createdByUserId: args.createdByUserId,
      members: {
        create: args.memberUserIds.map((userId) => ({ userId })),
      },
    },
    select: { id: true },
  });
  return t.id;
}

// Genera un score 2-1 o 2-0 con games 6-4/4-6/7-5 etc, pseudo-aleatorio.
// El primer side de la lista gana. Devuelve sets en orden 1..3.
function makeScore(
  winnerSide: 'A' | 'B',
): Array<{ setNumber: number; gamesA: number; gamesB: number }> {
  // 60% 2-0, 40% 2-1.
  const goes3 = Math.random() < 0.4;
  const sets: Array<{ setNumber: number; gamesA: number; gamesB: number }> = [];
  // Set 1: ganador
  sets.push(makeSet(1, winnerSide));
  // Set 2: ganador o perdedor según goes3
  sets.push(makeSet(2, goes3 ? (winnerSide === 'A' ? 'B' : 'A') : winnerSide));
  // Set 3 si 2-1
  if (goes3) sets.push(makeSet(3, winnerSide));
  return sets;
}

function makeSet(
  setNumber: number,
  setWinner: 'A' | 'B',
): { setNumber: number; gamesA: number; gamesB: number } {
  // Resultado posible: 6-4, 6-3, 6-2, 7-5, 7-6 (tiebreak)
  const variants = [
    [6, 4],
    [6, 3],
    [6, 2],
    [7, 5],
    [7, 6],
  ];
  const [w, l] = variants[Math.floor(Math.random() * variants.length)]!;
  return setWinner === 'A'
    ? { setNumber, gamesA: w!, gamesB: l! }
    : { setNumber, gamesA: l!, gamesB: w! };
}

// Crea Match + MatchResult + Sets + cierra Match en CONFIRMED. Devuelve id.
async function createConfirmedMatch(args: {
  leagueId: string;
  teamAId: string;
  teamBId: string;
  winnerTeamId: string;
  submittedByUserId: string;
  scheduledAt: Date;
  deadlineAt: Date;
  round?: number;
  americanaRound?: number;
  americanaCourt?: number;
  competitionGroupId?: string;
  bracketSide?: BracketSide;
  bracketRound?: number;
  bracketPosition?: number;
  sourceMatchAId?: string;
  sourceMatchBId?: string;
}): Promise<string> {
  const winnerSide: 'A' | 'B' = args.winnerTeamId === args.teamAId ? 'A' : 'B';
  const sets = makeScore(winnerSide);

  const match = await prisma.match.create({
    data: {
      leagueId: args.leagueId,
      teamAId: args.teamAId,
      teamBId: args.teamBId,
      status: 'CONFIRMED' as MatchStatus,
      scheduledAt: args.scheduledAt,
      deadlineAt: args.deadlineAt,
      winnerTeamId: args.winnerTeamId,
      round: args.round ?? null,
      americanaRound: args.americanaRound ?? null,
      americanaCourt: args.americanaCourt ?? null,
      competitionGroupId: args.competitionGroupId ?? null,
      bracketSide: args.bracketSide ?? null,
      bracketRound: args.bracketRound ?? null,
      bracketPosition: args.bracketPosition ?? null,
      sourceMatchAId: args.sourceMatchAId ?? null,
      sourceMatchBId: args.sourceMatchBId ?? null,
    },
    select: { id: true },
  });

  const result = await prisma.matchResult.create({
    data: {
      matchId: match.id,
      submittedByUserId: args.submittedByUserId,
      submitterTeamId: args.teamAId,
      submittedAt: args.scheduledAt,
      status: 'CONFIRMED',
      winnerTeamId: args.winnerTeamId,
      validatedByUserId: args.submittedByUserId,
      validatedAt: args.scheduledAt,
      sets: { create: sets },
    },
    select: { id: true },
  });

  await prisma.match.update({
    where: { id: match.id },
    data: { confirmedResultId: result.id },
  });

  return match.id;
}

// Para Americana ROTATING_INDIVIDUAL — match sin team, con MatchParticipant
// y resultado en games (sin sets convencionales — la app suma games por side).
async function createAmericanaIndividualMatch(args: {
  leagueId: string;
  round: number;
  court: number;
  sideAUserIds: [string, string];
  sideBUserIds: [string, string];
  winnerSide: 'A' | 'B' | 'DRAW';
  scheduledAt: Date;
  submittedByUserId: string;
}): Promise<string> {
  // Un único "set" que representa el resultado en games (formato FIRST_TO_GAMES).
  const targetGames = 8;
  let gamesA: number;
  let gamesB: number;
  if (args.winnerSide === 'A') {
    gamesA = targetGames;
    gamesB = Math.floor(Math.random() * (targetGames - 2)); // 0..6
  } else if (args.winnerSide === 'B') {
    gamesB = targetGames;
    gamesA = Math.floor(Math.random() * (targetGames - 2));
  } else {
    gamesA = targetGames;
    gamesB = targetGames;
  }

  const match = await prisma.match.create({
    data: {
      leagueId: args.leagueId,
      teamAId: null,
      teamBId: null,
      status: 'CONFIRMED' as MatchStatus,
      scheduledAt: args.scheduledAt,
      deadlineAt: args.scheduledAt,
      americanaRound: args.round,
      americanaCourt: args.court,
      winnerTeamId: null,
      participants: {
        create: [
          { userId: args.sideAUserIds[0], side: 'A', partnerIndex: 1 },
          { userId: args.sideAUserIds[1], side: 'A', partnerIndex: 2 },
          { userId: args.sideBUserIds[0], side: 'B', partnerIndex: 1 },
          { userId: args.sideBUserIds[1], side: 'B', partnerIndex: 2 },
        ],
      },
    },
    select: { id: true },
  });

  const result = await prisma.matchResult.create({
    data: {
      matchId: match.id,
      submittedByUserId: args.submittedByUserId,
      submitterTeamId: null,
      submittedAt: args.scheduledAt,
      status: 'CONFIRMED',
      winnerTeamId: null,
      validatedByUserId: args.submittedByUserId,
      validatedAt: args.scheduledAt,
      sets: { create: [{ setNumber: 1, gamesA, gamesB }] },
    },
    select: { id: true },
  });

  await prisma.match.update({
    where: { id: match.id },
    data: { confirmedResultId: result.id },
  });

  return match.id;
}

// Round-robin (circle method) — devuelve pares por ronda.
function roundRobin(teamIds: string[]): Array<{ round: number; pairs: Array<[string, string]> }> {
  const n = teamIds.length;
  const ids = n % 2 === 0 ? [...teamIds] : [...teamIds, '__BYE__'];
  const m = ids.length;
  const rounds = m - 1;
  const out: Array<{ round: number; pairs: Array<[string, string]> }> = [];
  const rotation = ids.slice(1);
  const fixed = ids[0]!;
  for (let r = 0; r < rounds; r++) {
    const slots = [fixed, ...rotation];
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < m / 2; i++) {
      const a = slots[i]!;
      const b = slots[m - 1 - i]!;
      if (a !== '__BYE__' && b !== '__BYE__') pairs.push([a, b]);
    }
    out.push({ round: r + 1, pairs });
    // Rotate: keep fixed at slot 0, rotate the rest CCW
    rotation.unshift(rotation.pop()!);
  }
  return out;
}

// ─── Borrado idempotente: ligas demo viejas ───────────────────────────────

async function deleteOldDemoLeagues(): Promise<void> {
  const slugs = [
    'demo-liga-otono-2026',
    'demo-torneo-grupos-2026',
    'demo-torneo-directo-2026',
    'demo-americana-parejas-2026',
    'demo-americana-individual-2026',
  ];
  for (const slug of slugs) {
    const league = await prisma.league.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (league) {
      // Match.teamA/B son Restrict. Hay que borrar matches a mano antes que la
      // liga, en orden inverso de dependencia bracket: hijos primero.
      // Borramos primero results+sets (cascade desde Match), luego matches en
      // orden bracket inverso (hojas primero).
      const matches = await prisma.match.findMany({
        where: { leagueId: league.id },
        select: { id: true, bracketRound: true },
        orderBy: { bracketRound: 'desc' },
      });
      for (const m of matches) {
        // Cascade desde Match limpia MatchResult/Set/Participant.
        await prisma.match.delete({ where: { id: m.id } });
      }
      await prisma.league.delete({ where: { id: league.id } });
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[seed-demo] Comenzando seed de demo data…');

  // 1. Demo user (idempotente)
  const demoPasswordHash = await hash(DEMO_PASSWORD, ARGON2_OPTS);
  const demoUserId = await ensureUser({
    email: DEMO_EMAIL,
    name: DEMO_NAME,
    category: 'INTERMEDIATE',
    passwordHash: demoPasswordHash,
  });
  console.log(`[seed-demo] Demo user OK: ${DEMO_EMAIL} (id=${demoUserId})`);

  // 2. Synthetic users — mismo password para todos los demo
  const synthPasswordHash = await hash('Demo2026!', ARGON2_OPTS);
  const synthIds: Record<string, string> = {};
  for (const u of SYNTHETIC_USERS) {
    synthIds[u.email] = await ensureUser({
      email: u.email,
      name: u.name,
      category: u.category,
      passwordHash: synthPasswordHash,
    });
  }
  console.log(`[seed-demo] ${SYNTHETIC_USERS.length} usuarios sintéticos OK`);

  // 3. Limpiar ligas demo previas para que el seed sea regenerable
  await deleteOldDemoLeagues();

  // 4. Crear equipos. El demo está en 3 equipos distintos para verlo en
  //    contextos variados.
  const u = synthIds;

  // Equipos con demo (3 parejas: 1 para liga, 1 para torneo con grupos, 1 para americana parejas)
  const teamDemoAna = await ensureTeam({
    name: 'Demo & Ana',
    category: 'INTERMEDIATE',
    memberUserIds: [demoUserId, u['ana.garcia@demo.padelleague.app']!],
    createdByUserId: demoUserId,
  });
  const teamDemoBruno = await ensureTeam({
    name: 'Demo & Bruno',
    category: 'INTERMEDIATE',
    memberUserIds: [demoUserId, u['bruno.lopez@demo.padelleague.app']!],
    createdByUserId: demoUserId,
  });
  const teamDemoCarla = await ensureTeam({
    name: 'Demo & Carla',
    category: 'INTERMEDIATE',
    memberUserIds: [demoUserId, u['carla.martin@demo.padelleague.app']!],
    createdByUserId: demoUserId,
  });

  // Equipos rivales (sin demo)
  const rivalDuos: Array<{ name: string; a: string; b: string; cat: TeamCategory }> = [
    { name: 'Los Reflejos', a: 'david.ruiz@demo.padelleague.app', b: 'elena.perez@demo.padelleague.app', cat: 'INTERMEDIATE' },
    { name: 'Smash Bros', a: 'fer.diaz@demo.padelleague.app', b: 'gabi.romero@demo.padelleague.app', cat: 'INTERMEDIATE' },
    { name: 'Bandeja & Víbora', a: 'hugo.silva@demo.padelleague.app', b: 'ines.vega@demo.padelleague.app', cat: 'INTERMEDIATE' },
    { name: 'Cristal Volador', a: 'javi.mora@demo.padelleague.app', b: 'lola.nieto@demo.padelleague.app', cat: 'INTERMEDIATE' },
    { name: 'Padel All Stars', a: 'marc.cano@demo.padelleague.app', b: 'noa.bravo@demo.padelleague.app', cat: 'INTERMEDIATE' },
    { name: 'Walloff Pro', a: 'oscar.lima@demo.padelleague.app', b: 'paula.iglesias@demo.padelleague.app', cat: 'INTERMEDIATE' },
    { name: 'Cuarta Rinconera', a: 'quim.feliu@demo.padelleague.app', b: 'raul.castro@demo.padelleague.app', cat: 'INTERMEDIATE' },
    // Avanzados (para una eliminatoria de Torneo con seeds altos)
    { name: 'Tornado Top', a: 'sofia.lara@demo.padelleague.app', b: 'tomas.olid@demo.padelleague.app', cat: 'ADVANCED' },
    { name: 'Ace Killers', a: 'uxue.gil@demo.padelleague.app', b: 'victor.benet@demo.padelleague.app', cat: 'ADVANCED' },
    { name: 'Pelotazo FC', a: 'wendy.soto@demo.padelleague.app', b: 'xavi.peral@demo.padelleague.app', cat: 'BEGINNER' },
    { name: 'Globero & Co', a: 'yael.rico@demo.padelleague.app', b: 'ana.garcia@demo.padelleague.app', cat: 'INTERMEDIATE' },
  ];

  const rivalTeamIds: Record<string, string> = {};
  for (const r of rivalDuos) {
    rivalTeamIds[r.name] = await ensureTeam({
      name: r.name,
      category: r.cat,
      memberUserIds: [u[r.a]!, u[r.b]!],
      createdByUserId: u[r.a]!,
    });
  }
  console.log(`[seed-demo] Equipos OK (3 con demo + ${rivalDuos.length} rivales)`);

  // ─── LIGA: 8 equipos round-robin (28 partidos confirmados) ──────────────
  const liga = await prisma.league.create({
    data: {
      name: 'Liga Otoño Demo 2026',
      slug: 'demo-liga-otono-2026',
      description: 'Liga round-robin de prueba con 8 parejas — datos generados automáticamente.',
      type: 'LEAGUE',
      category: 'INTERMEDIATE',
      status: 'ACTIVE',
      registrationStart: daysAgo(60),
      registrationEnd: daysAgo(45),
      startDate: daysAgo(40),
      endDate: daysFromNow(20),
      createdByUserId: demoUserId,
    },
    select: { id: true },
  });
  const ligaTeams: string[] = [
    teamDemoAna,
    rivalTeamIds['Los Reflejos']!,
    rivalTeamIds['Smash Bros']!,
    rivalTeamIds['Bandeja & Víbora']!,
    rivalTeamIds['Cristal Volador']!,
    rivalTeamIds['Padel All Stars']!,
    rivalTeamIds['Walloff Pro']!,
    rivalTeamIds['Cuarta Rinconera']!,
  ];
  await prisma.leagueRegistration.createMany({
    data: ligaTeams.map((teamId) => ({
      leagueId: liga.id,
      teamId,
      registeredByUserId: demoUserId,
      registeredAt: daysAgo(45),
    })),
  });
  // Generar fixtures y confirmar la mayoría (dejamos 4 sin jugar al final)
  const ligaFixtures = roundRobin(ligaTeams);
  let ligaMatchIdx = 0;
  const totalLigaMatches = ligaFixtures.reduce((acc, r) => acc + r.pairs.length, 0);
  const ligaMatchesToFinish = totalLigaMatches - 4; // 24 confirmados, 4 abiertos
  for (const round of ligaFixtures) {
    for (const [tA, tB] of round.pairs) {
      const isFinished = ligaMatchIdx < ligaMatchesToFinish;
      if (isFinished) {
        const winner = Math.random() < 0.5 ? tA : tB;
        await createConfirmedMatch({
          leagueId: liga.id,
          teamAId: tA,
          teamBId: tB,
          winnerTeamId: winner,
          submittedByUserId: demoUserId,
          scheduledAt: daysAgo(35 - round.round * 4),
          deadlineAt: daysFromNow(20),
          round: round.round,
        });
      } else {
        await prisma.match.create({
          data: {
            leagueId: liga.id,
            teamAId: tA,
            teamBId: tB,
            status: 'SCHEDULED',
            scheduledAt: daysFromNow(2 + ligaMatchIdx),
            deadlineAt: daysFromNow(20),
            round: round.round,
          },
        });
      }
      ligaMatchIdx++;
    }
  }
  console.log(`[seed-demo] LIGA OK — ${totalLigaMatches} matches (${ligaMatchesToFinish} confirmados, 4 pendientes)`);

  // ─── TORNEO con grupos: 8 equipos, 2 grupos de 4, top 2 → bracket Oro ───
  const torneoGrupos = await prisma.league.create({
    data: {
      name: 'Open Demo Otoño (con grupos)',
      slug: 'demo-torneo-grupos-2026',
      description: 'Torneo eliminatorio con fase de grupos: 8 parejas, 2 grupos de 4, top 2 avanzan, bracket Oro + Plata.',
      type: 'TOURNAMENT',
      category: 'INTERMEDIATE',
      status: 'ACTIVE',
      registrationStart: daysAgo(35),
      registrationEnd: daysAgo(25),
      startDate: daysAgo(20),
      endDate: daysFromNow(15),
      hasGroupPhase: true,
      groupCount: 2,
      teamsPerGroup: 4,
      qualifiersPerGroup: 2,
      bracketSeedingMode: 'AUTO',
      createdByUserId: demoUserId,
    },
    select: { id: true },
  });
  const torneoGruposTeams = [
    teamDemoBruno,
    rivalTeamIds['Los Reflejos']!,
    rivalTeamIds['Smash Bros']!,
    rivalTeamIds['Bandeja & Víbora']!,
    rivalTeamIds['Tornado Top']!,
    rivalTeamIds['Ace Killers']!,
    rivalTeamIds['Padel All Stars']!,
    rivalTeamIds['Walloff Pro']!,
  ];
  // 2 grupos de 4: A=[0,1,2,3], B=[4,5,6,7]
  const grupoA = await prisma.competitionGroup.create({
    data: { leagueId: torneoGrupos.id, name: 'Grupo A', index: 0 },
    select: { id: true },
  });
  const grupoB = await prisma.competitionGroup.create({
    data: { leagueId: torneoGrupos.id, name: 'Grupo B', index: 1 },
    select: { id: true },
  });
  const groupAssignment: Record<string, string> = {};
  for (let i = 0; i < 4; i++) groupAssignment[torneoGruposTeams[i]!] = grupoA.id;
  for (let i = 4; i < 8; i++) groupAssignment[torneoGruposTeams[i]!] = grupoB.id;
  await prisma.leagueRegistration.createMany({
    data: torneoGruposTeams.map((teamId) => ({
      leagueId: torneoGrupos.id,
      teamId,
      competitionGroupId: groupAssignment[teamId]!,
      registeredByUserId: demoUserId,
      registeredAt: daysAgo(30),
    })),
  });
  // Fase de grupos: round-robin dentro de cada grupo (6 matches × 2 = 12)
  const groupAFixtures = roundRobin(torneoGruposTeams.slice(0, 4));
  const groupBFixtures = roundRobin(torneoGruposTeams.slice(4, 8));
  // Calculamos ganadores acumulados para "clasificar" 1ºA, 2ºA, 1ºB, 2ºB
  const groupAWins: Record<string, number> = {};
  const groupBWins: Record<string, number> = {};
  for (const round of groupAFixtures) {
    for (const [tA, tB] of round.pairs) {
      // Forzamos a que el demo (teamDemoBruno = índice 0 del grupo A) gane
      // sus partidos del grupo para que clasifique como 1ºA — mejora la
      // narrativa de la demo (Demo Player avanzando en el bracket).
      let winner: string;
      if (tA === teamDemoBruno) winner = tA;
      else if (tB === teamDemoBruno) winner = tB;
      else winner = Math.random() < 0.5 ? tA : tB;
      groupAWins[winner] = (groupAWins[winner] ?? 0) + 1;
      await createConfirmedMatch({
        leagueId: torneoGrupos.id,
        teamAId: tA,
        teamBId: tB,
        winnerTeamId: winner,
        submittedByUserId: demoUserId,
        scheduledAt: daysAgo(18 - round.round * 2),
        deadlineAt: daysFromNow(15),
        round: round.round,
        competitionGroupId: grupoA.id,
      });
    }
  }
  for (const round of groupBFixtures) {
    for (const [tA, tB] of round.pairs) {
      const winner = Math.random() < 0.5 ? tA : tB;
      groupBWins[winner] = (groupBWins[winner] ?? 0) + 1;
      await createConfirmedMatch({
        leagueId: torneoGrupos.id,
        teamAId: tA,
        teamBId: tB,
        winnerTeamId: winner,
        submittedByUserId: demoUserId,
        scheduledAt: daysAgo(18 - round.round * 2),
        deadlineAt: daysFromNow(15),
        round: round.round,
        competitionGroupId: grupoB.id,
      });
    }
  }
  // Clasificados: top-2 por wins (deshacemos empate por orden de registro)
  const sortedA = [...torneoGruposTeams.slice(0, 4)].sort((a, b) => (groupBWins[b] ?? 0) - (groupBWins[a] ?? 0));
  const sortedB = [...torneoGruposTeams.slice(4, 8)].sort((a, b) => (groupBWins[b] ?? 0) - (groupBWins[a] ?? 0));
  // Re-orden por groupAWins para A
  const finalSortedA = [...torneoGruposTeams.slice(0, 4)].sort((a, b) => (groupAWins[b] ?? 0) - (groupAWins[a] ?? 0));
  const _ = sortedA; void _; // (placeholder por si quisiera depurar)
  const oroSF1A = finalSortedA[0]!; // 1º A
  const oroSF1B = sortedB[1]!; // 2º B
  const oroSF2A = sortedB[0]!; // 1º B
  const oroSF2B = finalSortedA[1]!; // 2º A
  // Bracket Oro (4 equipos = 2 semis + 1 final)
  const semi1Winner = oroSF1A; // demoBruno clasifica 1ºA; le hacemos ganar semi
  const semi2Winner = Math.random() < 0.5 ? oroSF2A : oroSF2B;
  const finalWinner = Math.random() < 0.5 ? semi1Winner : semi2Winner;
  const semi1Loser = semi1Winner === oroSF1A ? oroSF1B : oroSF1A;
  const semi2Loser = semi2Winner === oroSF2A ? oroSF2B : oroSF2A;

  // Bracket Oro R0 (semifinales)
  const goldSemi1 = await createConfirmedMatch({
    leagueId: torneoGrupos.id,
    teamAId: oroSF1A,
    teamBId: oroSF1B,
    winnerTeamId: semi1Winner,
    submittedByUserId: demoUserId,
    scheduledAt: daysAgo(10),
    deadlineAt: daysFromNow(15),
    bracketSide: 'GOLD',
    bracketRound: 0,
    bracketPosition: 0,
  });
  const goldSemi2 = await createConfirmedMatch({
    leagueId: torneoGrupos.id,
    teamAId: oroSF2A,
    teamBId: oroSF2B,
    winnerTeamId: semi2Winner,
    submittedByUserId: demoUserId,
    scheduledAt: daysAgo(10),
    deadlineAt: daysFromNow(15),
    bracketSide: 'GOLD',
    bracketRound: 0,
    bracketPosition: 1,
  });
  // Bracket Oro R1 (final)
  await createConfirmedMatch({
    leagueId: torneoGrupos.id,
    teamAId: semi1Winner,
    teamBId: semi2Winner,
    winnerTeamId: finalWinner,
    submittedByUserId: demoUserId,
    scheduledAt: daysAgo(3),
    deadlineAt: daysFromNow(15),
    bracketSide: 'GOLD',
    bracketRound: 1,
    bracketPosition: 0,
    sourceMatchAId: goldSemi1,
    sourceMatchBId: goldSemi2,
  });
  // Bracket Plata: perdedores de R0 Oro se enfrentan en final Plata
  const silverFinalWinner = Math.random() < 0.5 ? semi1Loser : semi2Loser;
  await createConfirmedMatch({
    leagueId: torneoGrupos.id,
    teamAId: semi1Loser,
    teamBId: semi2Loser,
    winnerTeamId: silverFinalWinner,
    submittedByUserId: demoUserId,
    scheduledAt: daysAgo(3),
    deadlineAt: daysFromNow(15),
    bracketSide: 'SILVER',
    bracketRound: 0,
    bracketPosition: 0,
    sourceMatchAId: goldSemi1,
    sourceMatchBId: goldSemi2,
  });
  console.log('[seed-demo] TORNEO con grupos OK — 12 group matches + bracket Oro (3) + Plata (1)');

  // ─── TORNEO sin grupos: 8 equipos eliminación directa + Plata ─────────────
  const torneoDirecto = await prisma.league.create({
    data: {
      name: 'Open Demo Express (sin grupos)',
      slug: 'demo-torneo-directo-2026',
      description: 'Torneo eliminatorio puro: 8 parejas, eliminación directa Oro + Plata.',
      type: 'TOURNAMENT',
      category: 'INTERMEDIATE',
      status: 'ACTIVE',
      registrationStart: daysAgo(20),
      registrationEnd: daysAgo(15),
      startDate: daysAgo(10),
      endDate: daysFromNow(10),
      hasGroupPhase: false,
      bracketSeedingMode: 'AUTO',
      createdByUserId: demoUserId,
    },
    select: { id: true },
  });
  const torneoDirectoTeams = [
    teamDemoAna,
    rivalTeamIds['Tornado Top']!,
    rivalTeamIds['Ace Killers']!,
    rivalTeamIds['Smash Bros']!,
    rivalTeamIds['Bandeja & Víbora']!,
    rivalTeamIds['Padel All Stars']!,
    rivalTeamIds['Cristal Volador']!,
    rivalTeamIds['Walloff Pro']!,
  ];
  await prisma.leagueRegistration.createMany({
    data: torneoDirectoTeams.map((teamId, i) => ({
      leagueId: torneoDirecto.id,
      teamId,
      seedOrder: i,
      registeredByUserId: demoUserId,
      registeredAt: daysAgo(15),
    })),
  });
  // Bracket de 8: cruce clásico — 1v8, 4v5, 3v6, 2v7
  // Posiciones: 0:1v8, 1:4v5, 2:3v6, 3:2v7. R1: 0(winner0 vs winner1), 1(winner2 vs winner3). R2: 0 (final).
  const pairsR0: Array<[string, string]> = [
    [torneoDirectoTeams[0]!, torneoDirectoTeams[7]!],
    [torneoDirectoTeams[3]!, torneoDirectoTeams[4]!],
    [torneoDirectoTeams[2]!, torneoDirectoTeams[5]!],
    [torneoDirectoTeams[1]!, torneoDirectoTeams[6]!],
  ];
  // Forzamos al equipo del demo (teamDemoAna en posición 0) a ganar su R0
  const r0Winners: string[] = [];
  const r0Losers: string[] = [];
  const r0Ids: string[] = [];
  for (let i = 0; i < pairsR0.length; i++) {
    const [tA, tB] = pairsR0[i]!;
    let winner: string;
    if (i === 0) winner = tA; // demo gana
    else winner = Math.random() < 0.5 ? tA : tB;
    r0Winners.push(winner);
    r0Losers.push(winner === tA ? tB : tA);
    const id = await createConfirmedMatch({
      leagueId: torneoDirecto.id,
      teamAId: tA,
      teamBId: tB,
      winnerTeamId: winner,
      submittedByUserId: demoUserId,
      scheduledAt: daysAgo(8),
      deadlineAt: daysFromNow(10),
      bracketSide: 'GOLD',
      bracketRound: 0,
      bracketPosition: i,
    });
    r0Ids.push(id);
  }
  // R1 (semis) Oro — solo confirmamos la semi del demo, la otra queda pendiente
  // para que se vea un bracket "en curso"
  const semiDemoWinner = r0Winners[0]!; // demo team
  const semiOtherWinnerPending = null; // pendiente
  void semiOtherWinnerPending;
  const semiDemoId = await createConfirmedMatch({
    leagueId: torneoDirecto.id,
    teamAId: r0Winners[0]!,
    teamBId: r0Winners[1]!,
    winnerTeamId: semiDemoWinner,
    submittedByUserId: demoUserId,
    scheduledAt: daysAgo(2),
    deadlineAt: daysFromNow(10),
    bracketSide: 'GOLD',
    bracketRound: 1,
    bracketPosition: 0,
    sourceMatchAId: r0Ids[0],
    sourceMatchBId: r0Ids[1],
  });
  // Semi 2 — pendiente (sin winnerTeamId)
  const semiOtherId = await prisma.match.create({
    data: {
      leagueId: torneoDirecto.id,
      teamAId: r0Winners[2]!,
      teamBId: r0Winners[3]!,
      status: 'SCHEDULED',
      deadlineAt: daysFromNow(10),
      bracketSide: 'GOLD',
      bracketRound: 1,
      bracketPosition: 1,
      sourceMatchAId: r0Ids[2]!,
      sourceMatchBId: r0Ids[3]!,
    },
    select: { id: true },
  });
  // Final Oro — pendiente, solo conoce el lado del demo
  await prisma.match.create({
    data: {
      leagueId: torneoDirecto.id,
      teamAId: semiDemoWinner,
      teamBId: null,
      status: 'SCHEDULED',
      deadlineAt: daysFromNow(10),
      bracketSide: 'GOLD',
      bracketRound: 2,
      bracketPosition: 0,
      sourceMatchAId: semiDemoId,
      sourceMatchBId: semiOtherId.id,
    },
  });
  // Plata R0: 4 perdedores en 2 semis
  const silverR0Pairs: Array<[string, string]> = [
    [r0Losers[0]!, r0Losers[1]!],
    [r0Losers[2]!, r0Losers[3]!],
  ];
  const silverR0Winners: string[] = [];
  const silverR0Ids: string[] = [];
  for (let i = 0; i < silverR0Pairs.length; i++) {
    const [tA, tB] = silverR0Pairs[i]!;
    const winner = Math.random() < 0.5 ? tA : tB;
    silverR0Winners.push(winner);
    const id = await createConfirmedMatch({
      leagueId: torneoDirecto.id,
      teamAId: tA,
      teamBId: tB,
      winnerTeamId: winner,
      submittedByUserId: demoUserId,
      scheduledAt: daysAgo(5),
      deadlineAt: daysFromNow(10),
      bracketSide: 'SILVER',
      bracketRound: 0,
      bracketPosition: i,
      sourceMatchAId: r0Ids[i * 2]!,
      sourceMatchBId: r0Ids[i * 2 + 1]!,
    });
    silverR0Ids.push(id);
  }
  // Final Plata — pendiente (para ver propagación en curso)
  await prisma.match.create({
    data: {
      leagueId: torneoDirecto.id,
      teamAId: silverR0Winners[0]!,
      teamBId: silverR0Winners[1]!,
      status: 'SCHEDULED',
      deadlineAt: daysFromNow(10),
      bracketSide: 'SILVER',
      bracketRound: 1,
      bracketPosition: 0,
      sourceMatchAId: silverR0Ids[0]!,
      sourceMatchBId: silverR0Ids[1]!,
    },
  });
  console.log('[seed-demo] TORNEO directo OK — 4 cuartos + 1 semi confirmada + 1 semi pendiente + final Oro pendiente + 2 semis Plata + 1 final Plata pendiente');

  // ─── AMERICANA FIXED_PAIRS: 6 parejas, 2 pistas, FIRST_TO_GAMES=8 ─────────
  const ameParejas = await prisma.league.create({
    data: {
      name: 'Americana de Parejas Demo',
      slug: 'demo-americana-parejas-2026',
      description: 'Americana entre 6 parejas fijas, 2 pistas, FIRST_TO_GAMES=8.',
      type: 'AMERICANA',
      americanaVariant: 'FIXED_PAIRS',
      americanaRoundFormat: 'FIRST_TO_GAMES',
      americanaTargetGames: 8,
      americanaCourts: 2,
      category: 'INTERMEDIATE',
      status: 'ACTIVE',
      registrationStart: daysAgo(10),
      registrationEnd: daysAgo(6),
      startDate: daysAgo(5),
      endDate: daysAgo(5),
      createdByUserId: demoUserId,
    },
    select: { id: true },
  });
  const ameParejasTeams = [
    teamDemoCarla,
    rivalTeamIds['Los Reflejos']!,
    rivalTeamIds['Smash Bros']!,
    rivalTeamIds['Pelotazo FC']!,
    rivalTeamIds['Globero & Co']!,
    rivalTeamIds['Walloff Pro']!,
  ];
  await prisma.leagueRegistration.createMany({
    data: ameParejasTeams.map((teamId) => ({
      leagueId: ameParejas.id,
      teamId,
      registeredByUserId: demoUserId,
      registeredAt: daysAgo(6),
    })),
  });
  // Round-robin: 5 rondas de 3 partidos, distribuídas en 2 pistas
  const ameParejasFixtures = roundRobin(ameParejasTeams);
  for (const round of ameParejasFixtures) {
    let court = 1;
    for (const [tA, tB] of round.pairs) {
      // Como solo hay 2 pistas, el 3er match en una ronda sería en pista 1 de
      // la "siguiente sub-ronda" — en este seed simplificamos y dejamos que
      // las pistas se reciclen 1,2,1,...
      const winner = Math.random() < 0.5 ? tA : tB;
      await createConfirmedMatch({
        leagueId: ameParejas.id,
        teamAId: tA,
        teamBId: tB,
        winnerTeamId: winner,
        submittedByUserId: demoUserId,
        scheduledAt: daysAgo(5),
        deadlineAt: daysAgo(5),
        americanaRound: round.round,
        americanaCourt: court,
      });
      court = court === 1 ? 2 : 1;
    }
  }
  console.log('[seed-demo] AMERICANA FIXED_PAIRS OK — 15 matches confirmados');

  // ─── AMERICANA ROTATING_INDIVIDUAL: 8 jugadores, 2 pistas, 5 rondas ───────
  const ameIndividual = await prisma.league.create({
    data: {
      name: 'Americana Individual Demo',
      slug: 'demo-americana-individual-2026',
      description: 'Americana rotatoria de 8 jugadores individuales, 2 pistas, parejas cambian cada ronda.',
      type: 'AMERICANA',
      americanaVariant: 'ROTATING_INDIVIDUAL',
      americanaRoundFormat: 'FIRST_TO_GAMES',
      americanaTargetGames: 8,
      americanaCourts: 2,
      category: 'INTERMEDIATE',
      status: 'ACTIVE',
      registrationStart: daysAgo(8),
      registrationEnd: daysAgo(4),
      startDate: daysAgo(3),
      endDate: daysAgo(3),
      createdByUserId: demoUserId,
    },
    select: { id: true },
  });
  const ameIndividualPlayers = [
    demoUserId,
    u['ana.garcia@demo.padelleague.app']!,
    u['bruno.lopez@demo.padelleague.app']!,
    u['carla.martin@demo.padelleague.app']!,
    u['david.ruiz@demo.padelleague.app']!,
    u['elena.perez@demo.padelleague.app']!,
    u['fer.diaz@demo.padelleague.app']!,
    u['gabi.romero@demo.padelleague.app']!,
  ];
  await prisma.leagueRegistration.createMany({
    data: ameIndividualPlayers.map((userId) => ({
      leagueId: ameIndividual.id,
      userId,
      teamId: null,
      registeredByUserId: demoUserId,
      registeredAt: daysAgo(4),
    })),
  });
  // 5 rondas hardcoded — 2 matches por ronda (8 players / 4 per match = 2)
  // Maximizamos variedad de partners para que el demo juegue con varios.
  // Notación: P0..P7 = índice en ameIndividualPlayers
  const rondas: Array<Array<{ sideA: [number, number]; sideB: [number, number] }>> = [
    [
      { sideA: [0, 1], sideB: [2, 3] }, // demo+Ana vs Bruno+Carla
      { sideA: [4, 5], sideB: [6, 7] }, // David+Elena vs Fer+Gabi
    ],
    [
      { sideA: [0, 2], sideB: [1, 4] }, // demo+Bruno vs Ana+David
      { sideA: [3, 6], sideB: [5, 7] }, // Carla+Fer vs Elena+Gabi
    ],
    [
      { sideA: [0, 4], sideB: [3, 5] }, // demo+David vs Carla+Elena
      { sideA: [1, 6], sideB: [2, 7] }, // Ana+Fer vs Bruno+Gabi
    ],
    [
      { sideA: [0, 5], sideB: [1, 7] }, // demo+Elena vs Ana+Gabi
      { sideA: [2, 4], sideB: [3, 6] }, // Bruno+David vs Carla+Fer
    ],
    [
      { sideA: [0, 6], sideB: [4, 7] }, // demo+Fer vs David+Gabi
      { sideA: [1, 3], sideB: [2, 5] }, // Ana+Carla vs Bruno+Elena
    ],
  ];
  for (let r = 0; r < rondas.length; r++) {
    for (let c = 0; c < rondas[r]!.length; c++) {
      const m = rondas[r]![c]!;
      const sideAIds: [string, string] = [
        ameIndividualPlayers[m.sideA[0]]!,
        ameIndividualPlayers[m.sideA[1]]!,
      ];
      const sideBIds: [string, string] = [
        ameIndividualPlayers[m.sideB[0]]!,
        ameIndividualPlayers[m.sideB[1]]!,
      ];
      const winnerSide: 'A' | 'B' = Math.random() < 0.5 ? 'A' : 'B';
      await createAmericanaIndividualMatch({
        leagueId: ameIndividual.id,
        round: r + 1,
        court: c + 1,
        sideAUserIds: sideAIds,
        sideBUserIds: sideBIds,
        winnerSide,
        scheduledAt: daysAgo(3),
        submittedByUserId: demoUserId,
      });
    }
  }
  console.log('[seed-demo] AMERICANA ROTATING_INDIVIDUAL OK — 10 matches (5 rondas × 2 pistas)');

  // ─── Partidos sueltos (IndependentMatch) ─────────────────────────────────
  // Limpiamos previos del demo organizador
  const oldIndep = await prisma.independentMatch.findMany({
    where: { organizerId: demoUserId, name: { startsWith: '[demo]' } },
    select: { id: true },
  });
  for (const m of oldIndep) {
    await prisma.independentMatch.delete({ where: { id: m.id } });
  }
  // 1 pasado (con partial info), 1 futuro abierto, 1 confirmado pasado
  await prisma.independentMatch.create({
    data: {
      organizerId: demoUserId,
      name: '[demo] Sábado entre amigos',
      visibility: 'PUBLIC',
      scheduledAt: daysAgo(7),
      location: 'Real Pádel Avenida',
      description: 'Partido casual entre amigos, abierto a cualquiera.',
      maxPlayers: 4,
      status: 'CONFIRMED',
      participants: {
        create: [
          { userId: demoUserId, status: 'ACCEPTED', respondedAt: daysAgo(8) },
          { userId: u['ana.garcia@demo.padelleague.app']!, status: 'ACCEPTED', respondedAt: daysAgo(8) },
          { userId: u['bruno.lopez@demo.padelleague.app']!, status: 'ACCEPTED', respondedAt: daysAgo(8) },
          { userId: u['carla.martin@demo.padelleague.app']!, status: 'ACCEPTED', respondedAt: daysAgo(8) },
        ],
      },
    },
  });
  await prisma.independentMatch.create({
    data: {
      organizerId: demoUserId,
      name: '[demo] Partidillo del finde',
      visibility: 'PUBLIC',
      scheduledAt: daysFromNow(3),
      location: 'Club Pádel Norte',
      description: 'Buscamos 2 jugadores más para completar partido.',
      maxPlayers: 4,
      status: 'OPEN',
      participants: {
        create: [
          { userId: demoUserId, status: 'ACCEPTED', respondedAt: daysAgo(1) },
          { userId: u['david.ruiz@demo.padelleague.app']!, status: 'ACCEPTED', respondedAt: daysAgo(1) },
        ],
      },
    },
  });
  await prisma.independentMatch.create({
    data: {
      organizerId: u['raul.castro@demo.padelleague.app']!,
      name: '[demo] Match Avanzado Jueves',
      visibility: 'PUBLIC',
      scheduledAt: daysFromNow(5),
      location: 'Padel Center Diagonal',
      description: 'Partido de nivel avanzado.',
      maxPlayers: 4,
      status: 'OPEN',
      participants: {
        create: [
          { userId: u['raul.castro@demo.padelleague.app']!, status: 'ACCEPTED', respondedAt: daysAgo(1) },
          { userId: u['sofia.lara@demo.padelleague.app']!, status: 'ACCEPTED', respondedAt: daysAgo(1) },
          { userId: demoUserId, status: 'INVITED' },
        ],
      },
    },
  });
  console.log('[seed-demo] Partidos sueltos OK — 1 confirmado pasado + 2 abiertos futuros');

  console.log('\n[seed-demo] ✅ Seed completado.');
  console.log('────────────────────────────────────────────────────────────');
  console.log(`  Demo user:   ${DEMO_EMAIL}`);
  console.log(`  Password:    ${DEMO_PASSWORD}`);
  console.log(`  Usuarios:    ${SYNTHETIC_USERS.length + 1}`);
  console.log(`  Equipos:     ${3 + rivalDuos.length}`);
  console.log(`  Ligas demo:  5 (LIGA + 2 TORNEOS + 2 AMERICANAS)`);
  console.log(`  Partidos sueltos: 3`);
  console.log('────────────────────────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('[seed-demo] ❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
