import type { ProgressPoint } from '@/modules/leagues';

type Props = {
  points: ProgressPoint[];
  width?: number;
  height?: number;
};

const WIN_COLOR = '#10b981'; // emerald-500
const LOSS_COLOR = '#ef4444'; // red-500
const PAD = 6;

export function WinLossChart({ points, width = 240, height = 64 }: Props) {
  if (points.length === 0) {
    return (
      <div
        className="text-xs text-slate-400 italic flex items-center justify-center bg-slate-50 rounded-lg"
        style={{ width, height }}
      >
        Sin partidos jugados todavía
      </div>
    );
  }

  const maxY = Math.max(1, ...points.map((p) => Math.max(p.wins, p.losses)));
  const innerWidth = width - 2 * PAD;
  const innerHeight = height - 2 * PAD;
  const denom = points.length === 1 ? 1 : points.length - 1;
  const xAt = (idx: number) => PAD + (idx / denom) * innerWidth;
  const yAt = (val: number) => PAD + innerHeight - (val / maxY) * innerHeight;

  function buildPath(values: number[]): string {
    if (values.length === 1) {
      const x = xAt(0);
      const y = yAt(values[0]!);
      return `M${x},${y} L${x + 0.01},${y}`;
    }
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(v)}`).join(' ');
  }

  const winsPath = buildPath(points.map((p) => p.wins));
  const lossesPath = buildPath(points.map((p) => p.losses));
  const last = points[points.length - 1]!;

  return (
    <div className="space-y-1.5">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label={`Progreso: ${last.wins} victorias y ${last.losses} derrotas en ${points.length} partidos`}
      >
        <line
          x1={PAD}
          x2={width - PAD}
          y1={height - PAD}
          y2={height - PAD}
          stroke="#e5e7eb"
          strokeWidth={1}
        />
        <path d={lossesPath} fill="none" stroke={LOSS_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={winsPath} fill="none" stroke={WIN_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={xAt(points.length - 1)} cy={yAt(last.wins)} r={2.5} fill={WIN_COLOR} />
        <circle cx={xAt(points.length - 1)} cy={yAt(last.losses)} r={2.5} fill={LOSS_COLOR} />
      </svg>
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: WIN_COLOR }} />
          {last.wins} G
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: LOSS_COLOR }} />
          {last.losses} P
        </span>
        {last.draws > 0 && (
          <span className="text-slate-400">{last.draws} E</span>
        )}
      </div>
    </div>
  );
}
