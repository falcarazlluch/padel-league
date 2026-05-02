'use client';

interface Props {
  href: string;
}

export function AddToCalendarButton({ href }: Props) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
    >
      📅 Añadir al calendario
    </a>
  );
}
