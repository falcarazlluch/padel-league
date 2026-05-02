import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { buildIndependentMatchEvent, buildLeagueMatchEvent } from '@/shared/calendar/match-event-builder';
import { buildIcsString } from '@/shared/calendar/ics-builder';

const prisma = testPrisma();

async function user(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'h', emailVerifiedAt: new Date() },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('calendar match-event-builder + ics-builder — integration', () => {
  it('produces a valid .ics for a public independent match', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const m = await prisma.independentMatch.create({
      data: {
        organizerId: org.id,
        name: 'Sábado por la tarde',
        visibility: 'PUBLIC',
        maxPlayers: 4,
        scheduledAt: new Date('2026-05-03T17:00:00Z'),
        location: 'Club de Pádel',
      },
    });

    const built = await buildIndependentMatchEvent(m.id, org.id);
    expect(built.kind).toBe('ok');
    if (built.kind !== 'ok') return;

    const ics = buildIcsString(built.event);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain(`UID:match-${m.id}@padelleague.app`);
    expect(ics).toContain('SUMMARY:Sábado por la tarde');
    expect(ics).toContain('LOCATION:Club de Pádel');
    expect(ics).toContain('DTSTART:20260503T170000Z');
    expect(ics).toContain('DTEND:20260503T183000Z');
  });

  it('forbids non-members from a private independent match', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const stranger = await user('Stranger', `str-${Date.now()}`);
    const m = await prisma.independentMatch.create({
      data: {
        organizerId: org.id,
        name: 'Privado',
        visibility: 'PRIVATE',
        maxPlayers: 4,
        scheduledAt: new Date('2026-05-03T17:00:00Z'),
      },
    });

    const built = await buildIndependentMatchEvent(m.id, stranger.id);
    expect(built.kind).toBe('forbidden');
  });

  it('returns no-date when match has no scheduledAt', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const m = await prisma.independentMatch.create({
      data: {
        organizerId: org.id,
        name: 'Sin fecha',
        visibility: 'PUBLIC',
        maxPlayers: 4,
      },
    });

    const built = await buildIndependentMatchEvent(m.id, org.id);
    expect(built.kind).toBe('no-date');
  });
});
