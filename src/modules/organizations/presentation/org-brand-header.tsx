/**
 * Tenant identity block for the unauthenticated whitelabel surfaces (invite
 * landing, partner invite, login/registro reached from a link). Falls back to
 * the org initials when no logo has been uploaded, so the page never shows a
 * broken image or a generic Padel League mark where the club expects its own.
 */
export function OrgBrandHeader({
  name,
  logoUrl,
  tagline,
  size = 'md',
}: {
  name: string;
  logoUrl: string | null;
  tagline?: string | null;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'h-10 w-10 text-sm' : 'h-14 w-14 text-lg';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex items-center gap-3">
      {logoUrl ? (
        // Tenant logos are arbitrary external/blob URLs; a plain <img> avoids
        // having to allowlist every club domain in next.config images.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name}
          className={`${box} rounded-xl object-contain bg-white p-1 shadow-sm`}
        />
      ) : (
        <span
          className={`${box} rounded-xl bg-brand-navy text-white font-black grid place-items-center shadow-sm`}
          aria-hidden
        >
          {initials || 'PL'}
        </span>
      )}
      <div className="min-w-0">
        <p className={`font-black text-brand-navy leading-tight truncate ${size === 'sm' ? 'text-sm' : 'text-lg'}`}>
          {name}
        </p>
        {tagline ? (
          <p className="text-xs text-slate-500 leading-tight line-clamp-2">{tagline}</p>
        ) : null}
      </div>
    </div>
  );
}
