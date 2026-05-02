import { CalendarService } from '@/modules/calendar';
import { CalendarGrid } from './calendar-grid';
import { CalendarList } from './calendar-list';
import { CalendarNav } from './calendar-nav';

interface Props {
  userId: string;
  year: number;
  month: number;
  view: 'grid' | 'list';
}

const LEGEND = [
  { label: 'Mías', color: 'bg-brand-navy' },
  { label: 'Liga', color: 'bg-slate-300' },
  { label: 'Indep.', color: 'bg-brand-yellow' },
];

function todayMadridIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(new Date());
}

export async function CalendarSection({ userId, year, month, view }: Props) {
  const matches = await CalendarService.listMatchesForUserMonth(userId, year, month);
  const todayIso = todayMadridIso();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-brand-navy">Calendario</h2>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          {LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${l.color}`} aria-hidden />
              {l.label}
            </span>
          ))}
        </div>
      </div>
      <CalendarNav year={year} month={month} view={view} />
      {view === 'grid' ? (
        <CalendarGrid year={year} month={month} matches={matches} todayIso={todayIso} />
      ) : (
        <CalendarList matches={matches} />
      )}
    </section>
  );
}
