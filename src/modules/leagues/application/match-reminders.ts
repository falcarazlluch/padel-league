import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import { NotificationService } from '@/modules/notifications';

// Recordatorio "mañana tienes partido". Se ejecuta cada vez que cron-job.org
// pega `/api/cron/heartbeat` (cada minuto). Filtra matches con scheduledAt
// dentro de las próximas 18–30h (ventana amplia para tolerar caídas del cron
// o cambios de hora puntuales) y que aún no han sido recordados.
//
// Cubre tres orígenes:
//   - Match de competición LEAGUE o TOURNAMENT (dos equipos asignados).
//   - IndependentMatch ("partido suelto") — recordatorio a todos los
//     participants aceptados + organizador.
//
// La Americana queda fuera porque el evento es de un día completo y el
// usuario ya conoce la fecha al inscribirse.

const REMINDER_WINDOW_FROM_MS = 18 * 60 * 60 * 1000;
const REMINDER_WINDOW_TO_MS = 30 * 60 * 60 * 1000;

// Mensajes motivacionales con un punto de humor. Se elige uno al azar por
// match — varía en cada recordatorio para no aburrir al usuario.
const MOTIVATIONAL_LINES: ReadonlyArray<string> = [
  '¡A por todas! No olvides la pala, las zapatillas y... esos reflejos del último set.',
  'Mañana hay batalla. Lleva ropa, agua y el ego justo.',
  'Recuerda: el lob defensivo es como un mate, pero al revés. Tú puedes.',
  'Si pierdes mañana, mejor que sea por una. No por seis.',
  'Hidrátate, calienta y respira hondo en el primer punto. El resto sale solo.',
  'Mañana es el día. Pala, sonrisa y a comerte la pista.',
  '¡Vamooos! Lleva 2 botellas de agua, una para beber y otra para presumir.',
  'Recuerda: en pádel no hay revés malo, hay revés improvisado.',
  'Mañana tienes partido. Olvida el móvil, abraza la pala.',
  'Concéntrate, calienta y disfruta. Y si todo falla, siempre puedes culpar al cristal.',
];

function pickMotivational(seed: string): string {
  // Pick deterministic por matchId para que reabriendo la app el mensaje no
  // cambie a media tarde.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % MOTIVATIONAL_LINES.length;
  return MOTIVATIONAL_LINES[idx]!;
}

function formatMatchTime(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

export async function runDayBeforeRemindersSweep(): Promise<{ sent: number; matchesProcessed: number }> {
  const log = logger();
  const now = new Date();
  const from = new Date(now.getTime() + REMINDER_WINDOW_FROM_MS);
  const to = new Date(now.getTime() + REMINDER_WINDOW_TO_MS);

  // Matches LEAGUE/TOURNAMENT con fecha confirmada dentro de la ventana y
  // sin recordatorio enviado todavía. Cargamos league.type para el filter +
  // teamA/teamB.members para destinatarios + league.name para el body.
  const matches = await prisma.match.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      dayBeforeReminderSentAt: null,
      status: { in: ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'] },
      league: { type: { in: ['LEAGUE', 'TOURNAMENT'] } },
      teamAId: { not: null },
      teamBId: { not: null },
    },
    include: {
      league: { select: { name: true, slug: true } },
      teamA: { select: { name: true, members: { select: { userId: true } } } },
      teamB: { select: { name: true, members: { select: { userId: true } } } },
    },
    take: 500, // ventana de seguridad — un día típico mueve <50 matches
  });

  // Independent matches con fecha dentro de la ventana. Notificamos a los
  // participants aceptados + organizador (que puede no estar en participants
  // si solo gestiona). Deduplicamos por la columna del modelo.
  const independentMatches = await prisma.independentMatch.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      dayBeforeReminderSentAt: null,
      status: { in: ['OPEN', 'CONFIRMED'] },
    },
    include: {
      organizer: { select: { id: true, name: true } },
      participants: {
        where: { status: 'ACCEPTED' },
        select: { userId: true },
      },
    },
    take: 500,
  });

  if (matches.length === 0 && independentMatches.length === 0) {
    return { sent: 0, matchesProcessed: 0 };
  }

  let sent = 0;
  for (const m of matches) {
    if (!m.teamA || !m.teamB || !m.scheduledAt) continue;
    const userIds = [
      ...m.teamA.members.map((mb) => mb.userId),
      ...m.teamB.members.map((mb) => mb.userId),
    ];
    const time = formatMatchTime(m.scheduledAt);
    const motivational = pickMotivational(m.id);
    const body = `Mañana a las ${time} tienes partido: ${m.teamA.name} vs ${m.teamB.name}. ${motivational}`;

    try {
      await NotificationService.createMany(
        userIds.map((userId) => ({
          userId,
          type: 'DEADLINE_REMINDER' as const,
          title: 'Mañana tienes partido',
          body,
          metadata: { matchId: m.id, leagueSlug: m.league.slug, kind: 'day-before' },
        })),
      );
      await prisma.match.update({
        where: { id: m.id },
        data: { dayBeforeReminderSentAt: new Date() },
      });
      sent += userIds.length;
    } catch (err) {
      log.warn({ err, matchId: m.id }, 'day-before-reminder.failed');
    }
  }

  for (const im of independentMatches) {
    if (!im.scheduledAt) continue;
    // Set evita avisar dos veces al organizador si también está en
    // participants (caso típico cuando él mismo se apunta a su partido).
    const userIds = new Set<string>();
    userIds.add(im.organizerId);
    for (const p of im.participants) userIds.add(p.userId);
    if (userIds.size === 0) continue;

    const time = formatMatchTime(im.scheduledAt);
    const motivational = pickMotivational(im.id);
    const where = im.location ? ` en ${im.location}` : '';
    const body = `Mañana a las ${time} tienes partido "${im.name}"${where}. ${motivational}`;

    try {
      await NotificationService.createMany(
        [...userIds].map((userId) => ({
          userId,
          type: 'DEADLINE_REMINDER' as const,
          title: 'Mañana tienes partido',
          body,
          // matchKind=independent permite al payload-builder enviar el push
          // a `/jugar/{id}` en lugar de la URL de competición.
          metadata: { matchId: im.id, matchKind: 'independent', kind: 'day-before' },
        })),
      );
      await prisma.independentMatch.update({
        where: { id: im.id },
        data: { dayBeforeReminderSentAt: new Date() },
      });
      sent += userIds.size;
    } catch (err) {
      log.warn({ err, independentMatchId: im.id }, 'day-before-reminder.independent.failed');
    }
  }

  return { sent, matchesProcessed: matches.length + independentMatches.length };
}
