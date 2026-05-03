import Link from 'next/link';
import type { Route } from 'next';
import type { CommentaryFeedItem } from '@/modules/match-commentary';

type Props = {
  item: CommentaryFeedItem;
  showLeague?: boolean; // true on dashboard, false on league page
};

export function CommentaryFeedCard({ item, showLeague = false }: Props) {
  const { match, type, content, generatedAt } = item;
  const setsA = match.confirmedResult?.sets.filter((s) => s.gamesA > s.gamesB).length ?? 0;
  const setsB = match.confirmedResult?.sets.filter((s) => s.gamesB > s.gamesA).length ?? 0;
  const showScore = type === 'RECAP' && match.confirmedResult;

  const dateStr = new Date(generatedAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  });

  return (
    <Link
      href={`/ligas/${match.league.slug}/partidos/${match.id}` as Route}
      className="block bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow p-4"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="font-bold text-brand-navy text-sm truncate">
          {match.teamA.name} <span className="text-slate-400 font-normal">vs</span> {match.teamB.name}
        </p>
        {showScore ? (
          <span className="font-mono text-sm font-bold text-brand-navy shrink-0">
            {setsA} – {setsB}
          </span>
        ) : (
          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
            Previa
          </span>
        )}
      </div>
      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{content}</p>
      <p className="text-xs text-slate-400 mt-2 truncate">
        ✨ {showLeague ? `${match.league.name} · ` : ''}
        {type === 'PREVIEW' ? 'Previa' : 'Crónica'} · {dateStr}
      </p>
    </Link>
  );
}
