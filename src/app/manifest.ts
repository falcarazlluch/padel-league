import type { MetadataRoute } from 'next';
import { getTenant } from '@/shared/tenant/context';

// Web App Manifest. Next.js no tipa todavía `launch_handler` ni `capture_links`
// pero el navegador (Chrome 102+, Edge, Samsung Internet, partes en Safari 17)
// los lee. Por eso ampliamos el tipo con un cast pequeño al final.
type ExtraManifestFields = {
  launch_handler?: {
    client_mode?: 'navigate-existing' | 'navigate-new' | 'focus-existing' | 'auto';
  };
  capture_links?: 'none' | 'new-client' | 'existing-client-navigate';
  display_override?: Array<'standalone' | 'minimal-ui' | 'fullscreen' | 'browser' | 'window-controls-overlay'>;
};

// Tenant-aware: each whitelabel subdomain is its own origin, so it gets its own
// manifest and therefore installs as a separate PWA with the club's name and
// theme colour. A RACC member who installs from racc.mypadelleague.es ends up
// with "RACC" on their home screen. The icon stays the platform's — see below.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenant = await getTenant();
  // A manifest icon is a single slot, so the two marks cannot sit side by side
  // here. The platform icon wins: the club is already named in `name`, and the
  // rule is that the tenant logo never *replaces* the Padel League one.
  const icon = '/logopwa.png';

  const base: MetadataRoute.Manifest = {
    name: tenant?.name ?? 'Padel League',
    short_name: tenant?.name ?? 'Padel League',
    description: tenant
      ? (tenant.tagline ?? `Competiciones de pádel de ${tenant.name}`)
      : 'Gestión privada de ligas de pádel',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: tenant?.primaryColor ?? '#0D1E45',
    theme_color: tenant?.primaryColor ?? '#0D1E45',
    lang: 'es',
    icons: [
      {
        src: icon,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: icon,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };

  // Hooks para que las notificaciones push y los links de email/web compartido
  // abran la PWA instalada cuando exista, en lugar de una pestaña nueva.
  // - launch_handler.client_mode = 'navigate-existing': si la PWA ya está
  //   abierta, navega la ventana existente al destino. Sin nueva ventana.
  // - capture_links = 'existing-client-navigate': el SO redirige los clicks
  //   en links HTTPS dentro del scope a la PWA si está instalada
  //   (Chrome Android, Edge, soporte parcial en Safari 17.4+).
  // - display_override: si el navegador no soporta 'standalone' cae en
  //   'minimal-ui' (barra de URL fina) antes de 'browser'.
  const extras: ExtraManifestFields = {
    launch_handler: { client_mode: 'navigate-existing' },
    capture_links: 'existing-client-navigate',
    display_override: ['standalone', 'minimal-ui'],
  };

  return { ...base, ...extras } as MetadataRoute.Manifest;
}
