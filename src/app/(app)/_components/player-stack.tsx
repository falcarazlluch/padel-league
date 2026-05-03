import Image from 'next/image';

export interface StackPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Props {
  players: StackPlayer[];
  /** Pixel size of each avatar. Default 28. */
  size?: number;
  /** Show at most this many; the rest collapse into a `+N` chip. Default 4. */
  maxVisible?: number;
  /** Override the ring color (the gap between overlapping avatars). */
  ringClass?: string;
}

/**
 * Horizontal stack of player avatars with a slight overlap. Uses native title
 * attributes for desktop hover and long-press on mobile. Hidden players collapse
 * into a `+N` chip whose title lists their names.
 */
export function PlayerStack({
  players,
  size = 28,
  maxVisible = 4,
  ringClass = 'ring-white',
}: Props) {
  if (players.length === 0) return null;
  const visible = players.slice(0, maxVisible);
  const overflow = players.slice(maxVisible);
  const overlap = Math.round(size * 0.32);
  const fontSize = Math.round(size * 0.4);
  const overflowFontSize = Math.round(size * 0.36);

  return (
    <div
      className="flex items-center"
      aria-label={`${players.length} jugador${players.length === 1 ? '' : 'es'}: ${players.map((p) => p.name).join(', ')}`}
    >
      {visible.map((p, i) => {
        const style = {
          width: size,
          height: size,
          marginLeft: i === 0 ? 0 : -overlap,
        };
        if (p.avatarUrl) {
          return (
            <span
              key={p.id}
              className={`relative rounded-full overflow-hidden ring-2 ${ringClass} bg-slate-100 inline-flex shrink-0`}
              style={style}
              title={p.name}
            >
              <Image
                src={p.avatarUrl}
                alt={p.name}
                width={size}
                height={size}
                className="object-cover w-full h-full"
                unoptimized
              />
            </span>
          );
        }
        return (
          <span
            key={p.id}
            className={`relative rounded-full ring-2 ${ringClass} bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold flex items-center justify-center shrink-0`}
            style={{ ...style, fontSize }}
            title={p.name}
            aria-label={p.name}
          >
            {p.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
        );
      })}
      {overflow.length > 0 && (
        <span
          className={`relative rounded-full ring-2 ${ringClass} bg-slate-100 text-slate-600 font-bold flex items-center justify-center shrink-0`}
          style={{
            width: size,
            height: size,
            marginLeft: -overlap,
            fontSize: overflowFontSize,
          }}
          title={overflow.map((p) => p.name).join(', ')}
        >
          +{overflow.length}
        </span>
      )}
    </div>
  );
}
