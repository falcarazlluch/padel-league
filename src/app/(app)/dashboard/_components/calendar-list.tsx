import Link from 'next/link';
import type { Route } from 'next';
import type { CalendarMatch } from '@/modules/calendar';

interface Props {
  matches: CalendarMatch[];
}

const DOT_BY_CATEGORY: Record<CalendarMatch['category'], string> = {
  OWN_LEAGUE: 'bg-brand-navy',
  OTHER_LEAGUE_MINE: 'bg-slate-300',
  INDEPENDENT: 'bg-brand-yellow',
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDayHeading(iso: string): string {
  const [y, m, dd] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, dd ?? 1));
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Madrid',
  }).format(d);
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(d);
}

export function CalendarList({ matches }: Props) {
  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-6">
        <p className="text-slate-400 text-sm">No hay partidos programados en este mes.</p>
      </div>
    );
  }

  // Group by day-of-month iso key, preserving sorted order from input.
  const groups = new Map<string, CalendarMatch[]>();
  for (const m of matches) {
    const k = dayKey(m.scheduledAt);
    const arr = groups.get(k);
    if (arr) arr.push(m);
    else groups.set(k, [m]);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([iso, dayMatches]) => (
        <div key={iso} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 capitalize">{formatDayHeading(iso)}</h3>
          <ul className="space-y-2">
            {dayMatches.map((m) => (
              <li key={m.id}>
                <Link
                  href={m.href as Route}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors ${
                    m.status === 'TENTATIVE' ? 'text-slate-400 italic' : 'text-slate-700'
                  }`}
                >
                  <span className="text-sm tabular-nums w-12 shrink-0">{formatTime(m.scheduledAt)}</span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_BY_CATEGORY[m.category]} ${
                    m.status === 'TENTATIVE' ? 'opacity-60' : ''
                  }`} aria-hidden />
                  <span className="text-sm flex-1 truncate">{m.title}</span>
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider shrink-0">
                    {m.category === 'INDEPENDENT' ? 'Indep.' : m.category === 'OWN_LEAGUE' ? 'Liga' : 'Liga (otros)'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
