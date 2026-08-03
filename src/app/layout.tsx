import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { PWARegister } from './_components/PWARegister';
import { PushBootstrap } from './_components/PushBootstrap';
import { getTenant } from '@/shared/tenant/context';
import { OrgBrandStyle } from '@/modules/organizations';

// Metadata is tenant-aware: on racc.mypadelleague.es the tab, the PWA name and
// the theme colour are RACC's, not Padel League's.
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  if (!tenant) {
    return {
      title: 'Padel League',
      description: 'Gestión privada de ligas de pádel',
      applicationName: 'Padel League',
      appleWebApp: { capable: true, title: 'Padel League', statusBarStyle: 'black-translucent' },
      icons: { icon: '/logo.png', apple: '/logopwa.png' },
    };
  }
  return {
    title: tenant.name,
    description: tenant.tagline ?? `Competiciones de pádel de ${tenant.name}`,
    applicationName: tenant.name,
    appleWebApp: { capable: true, title: tenant.name, statusBarStyle: 'black-translucent' },
    // Single-slot like the manifest: the platform mark stays, since the tenant
    // is already named in the title.
    icons: { icon: '/logo.png', apple: '/logopwa.png' },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const tenant = await getTenant();
  return {
    themeColor: tenant?.primaryColor ?? '#0D1E45',
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tenant = await getTenant();
  return (
    <html lang="es">
      <body>
        {tenant && (
          <OrgBrandStyle
            primaryColor={tenant.primaryColor}
            secondaryColor={tenant.secondaryColor}
            accentColor={tenant.accentColor}
          />
        )}
        {children}
        <PWARegister />
        <PushBootstrap />
      </body>
    </html>
  );
}
