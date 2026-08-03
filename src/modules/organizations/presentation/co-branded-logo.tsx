import Image from 'next/image';

/**
 * Padel League on the left, the tenant on the right, separated by a rule.
 *
 * The tenant logo NEVER replaces the platform logo: Padel League is the product
 * and the club is the customer, so both marks stay visible everywhere a logo is
 * shown. Without a tenant this renders the platform logo alone, so callers do
 * not need to branch.
 *
 * `tone` picks the divider/text colours for the surface underneath: `dark` for
 * the navy nav bar, `light` for white cards.
 */
export function CoBrandedLogo({
  tenant,
  tone,
  size = 'md',
  priority = false,
}: {
  tenant: { name: string; logoUrl: string | null } | null;
  tone: 'dark' | 'light';
  /**
   * `nav` reproduces the app bar's original treatment: the platform mark is
   * deliberately taller than the bar and hangs over its bottom edge. The
   * negative margin lives on that image alone, so the club logo beside it stays
   * vertically centred inside the bar instead of hanging low too.
   */
  size?: 'sm' | 'md' | 'lg' | 'nav';
  priority?: boolean;
}) {
  const platform = PLATFORM_CLASS[size];
  const tenantBox = TENANT_CLASS[size];
  const divider =
    tone === 'dark' ? 'bg-white/25' : 'bg-slate-300';
  const nameColor = tone === 'dark' ? 'text-white' : 'text-brand-navy';

  return (
    <span className="flex items-center gap-2 sm:gap-3 min-w-0">
      <Image
        src="/logo.png"
        alt="Padel League"
        width={220}
        height={127}
        className={`${platform} w-auto object-contain shrink-0 drop-shadow-lg`}
        priority={priority}
        unoptimized
      />

      {tenant && (
        <>
          <span className={`${DIVIDER_CLASS[size]} w-px shrink-0 ${divider}`} aria-hidden />
          {tenant.logoUrl ? (
            // Tenant logos live on arbitrary blob/CDN hosts, so `unoptimized`
            // keeps them out of the image optimizer's allowlist.
            <Image
              src={tenant.logoUrl}
              alt={tenant.name}
              width={220}
              height={220}
              className={`${tenantBox} w-auto object-contain shrink-0 drop-shadow-lg`}
              priority={priority}
              unoptimized
            />
          ) : (
            <span className={`${NAME_CLASS[size]} font-black truncate ${nameColor}`}>
              {tenant.name}
            </span>
          )}
        </>
      )}
    </span>
  );
}

// The platform mark is 1024x592 (wide), tenant logos are typically squarer, so
// the tenant gets a slightly shorter box to keep the pair visually balanced.
const PLATFORM_CLASS = {
  sm: 'h-8',
  md: 'h-10 sm:h-12',
  lg: 'h-12 sm:h-16',
  // Same height and overhang as before the lockup existed.
  nav: 'h-16 sm:h-[5.5rem] -mb-3 sm:-mb-6',
} as const;

const TENANT_CLASS = {
  sm: 'h-6 max-w-[5rem]',
  md: 'h-8 sm:h-9 max-w-[7rem]',
  lg: 'h-10 sm:h-12 max-w-[9rem]',
  nav: 'h-10 sm:h-12 max-w-[8rem]',
} as const;

const DIVIDER_CLASS = {
  sm: 'h-5',
  md: 'h-7',
  lg: 'h-9',
  nav: 'h-8 sm:h-10',
} as const;

const NAME_CLASS = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  nav: 'text-lg sm:text-xl tracking-tight',
} as const;
