import type { ReactNode } from 'react';
import { AuthBackgroundVideo } from './_components/auth-background-video';
import { getTenant } from '@/shared/tenant/context';
import { CoBrandedLogo } from '@/modules/organizations';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // Under a whitelabel subdomain the auth card carries both marks, so a player
  // arriving from a club link recognises the club without losing sight of the
  // platform they are signing in to.
  const tenant = await getTenant();
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden bg-brand-navy">
      <AuthBackgroundVideo
        sources={[
          { src: '/pelota.webm', type: 'video/webm' },
          { src: '/pelota.mp4', type: 'video/mp4' },
        ]}
        poster="/pelota-poster.jpg"
        rate={0.5}
      />
      <div className="absolute inset-0 bg-brand-navy/60 pointer-events-none" aria-hidden />
      <div className="relative w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl border-t-4 border-brand-yellow p-8">
          <div className="flex justify-center mb-6">
            {/* Both marks: a player sent here from a club link should see the
                club, but also recognise the platform they are signing in to. */}
            <CoBrandedLogo
              tenant={tenant ? { name: tenant.name, logoUrl: tenant.logoUrl } : null}
              tone="light"
              size="md"
              priority
            />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
