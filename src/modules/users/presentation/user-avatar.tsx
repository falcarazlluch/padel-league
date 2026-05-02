import Image from 'next/image';

type Size = 'sm' | 'md' | 'lg';
const SIZE_PX: Record<Size, number> = { sm: 24, md: 32, lg: 64 };

interface Props {
  url: string | null | undefined;
  name: string;
  size?: Size;
}

export function UserAvatar({ url, name, size = 'sm' }: Props) {
  const px = SIZE_PX[size];
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (url) {
    return (
      <span
        className="rounded-full overflow-hidden bg-slate-100 inline-flex shrink-0"
        style={{ width: px, height: px }}
      >
        <Image
          src={url}
          alt={name}
          width={px}
          height={px}
          className="object-cover w-full h-full"
          unoptimized
        />
      </span>
    );
  }

  return (
    <span
      className="rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold flex items-center justify-center shrink-0"
      style={{ width: px, height: px, fontSize: Math.round(px * 0.4) }}
      aria-label={name}
    >
      {initial}
    </span>
  );
}
