import Link from 'next/link';
import type { Route } from 'next';
import type { CalendarMatch } from '@/modules/calendar';

interface Props {
  year: number;        // 4-digit
  month: number;       // 1-12
  matches: CalendarMatch[];
  todayIso: string;    // YYYY-MM-DD in Madrid
}

const PILL_BY_CATEGORY: Record<CalendarMatch['category'], string> = {
  OWN_LEAGUE: 'bg-brand-navy text-white',
  OTHER_LEAGUE_MINE: 'bg-slate-50 text-slate-500 border border-slate-200',
  INDEPENDENT: 'bg-brand-yellow text-brand-navy font-semibold',
};

const WEEKDAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function dayKey(d: Date): string {
  // YYYY-MM-DD in UTC; the service stores `scheduledAt` in UTC; calendar
  // uses Madrid for "today" but UTC for grouping is acceptable per spec.
  return d.toISOString().slice(0, 10);
}

function buildGridDays(year: number, month: number): Date[] {
  // First Monday on/before day 1 of month, six-week grid.
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  // JS day-of-week: 0 = Sun, 1 = Mon … 6 = Sat. Monday-first offset.
  const offset = (firstOfMonth.getUTCDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setUTCDate(start.getUTCDate() - offset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push(d);
  }
  return days;
}

export function CalendarGrid({ year, month, matches, todayIso }: Props) {
  const days = buildGridDays(year, month);

  // Group matches by YYYY-MM-DD.
  const byDay = new Map<string, CalendarMatch[]>();
  for (const m of matches) {
    const k = dayKey(m.scheduledAt);
    const arr = byDay.get(k);
    if (arr) arr.push(m);
    else byDay.set(k, [m]);
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/60">
        {WEEKDAYS_ES.map((label) => (
          <div key={label} className="text-[11px] font-bold uppercase tracking-widest text-slate-500 px-2 py-1.5 text-center">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const inMonth = d.getUTCMonth() === month - 1;
          const k = dayKey(d);
          const todays = byDay.get(k) ?? [];
          const isToday = k === todayIso;
          return (
            <div
              key={i}
              className={`border-b border-r border-slate-100 last-of-row:border-r-0 min-h-[5rem] sm:min-h-[6rem] p-1 text-xs flex flex-col gap-0.5 ${
                inMonth ? '' : 'bg-slate-50/30'
              } ${isToday ? 'ring-2 ring-brand-blue ring-inset' : ''}`}
            >
              <span className={`text-[11px] font-bold ${inMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                {d.getUTCDate()}
              </span>
              <ul className="flex flex-col gap-0.5">
                {todays.slice(0, 3).map((m) => (
                  <li key={m.id}>
                    <Link
                      href={m.href as Route}
                      className={`block truncate rounded px-1.5 py-0.5 text-[10px] ${PILL_BY_CATEGORY[m.category]} ${
                        m.status === 'TENTATIVE' ? 'opacity-60 border border-dashed' : ''
                      } hover:opacity-90 transition-opacity`}
                    >
                      {m.title}
                    </Link>
                  </li>
                ))}
                {todays.length > 3 && (
                  <li className="text-[10px] text-slate-400 px-1.5">+{todays.length - 3}</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
