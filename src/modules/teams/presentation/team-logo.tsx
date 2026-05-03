import Image from 'next/image';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<Size, number> = { sm: 24, md: 32, lg: 48, xl: 40 };

export function TeamLogo({
  url,
  name,
  size = 'md',
}: {
  url: string | null | undefined;
  name: string;
  size?: Size;
}) {
  const px = SIZE_PX[size];
  const initials = name.trim().slice(0, 2).toUpperCase();

  if (url) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full overflow-hidden bg-white border border-slate-200 shrink-0"
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
      className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold shrink-0"
      style={{ width: px, height: px, fontSize: Math.round(px * 0.4) }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}
